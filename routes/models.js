const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Model, User, ModelSetting, Hotspot } = require('../models');
const { isAuthenticated } = require('../middleware/auth');
const mongoose = require('mongoose');

// Use Cloudinary for file uploads in production
const isProduction = process.env.NODE_ENV === 'production';
let upload;

if (isProduction) {
    // Use Cloudinary in production
    const { uploadModel } = require('../upload-cloud');
    upload = uploadModel;
} else {
    // Configure multer for local file uploads in development
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, 'model-' + uniqueSuffix + ext);
        }
    });

    upload = multer({
        storage: storage,
        fileFilter: function (req, file, cb) {
            // Accept only 3D model files
            const allowedExtensions = ['.glb', '.gltf', '.usdz'];
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowedExtensions.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error('Only .glb, .gltf, and .usdz files are allowed'));
            }
        },
        limits: {
            fileSize: 50 * 1024 * 1024 // 50MB max file size
        }
    });
}

// List all models (public or owned by user)
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user ? req.session.user._id : null;

        // Build query
        let query = { is_public: true };

        // If user is logged in, also show their private models
        if (userId) {
            query = {
                $or: [
                    { is_public: true },
                    { user_id: userId }
                ]
            };
        }

        // Find models and populate owner information
        const models = await Model.find(query)
            .sort({ created_at: -1 })
            .populate('user_id', 'username')
            .lean();

        // Format models for template
        const formattedModels = models.map(model => ({
            ...model,
            owner: model.user_id.username,
            id: model._id
        }));

        res.render('models/index', {
            title: 'Models',
            models: formattedModels,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to fetch models',
            error: {}
        });
    }
});

// Show form to upload a new model
router.get('/upload', isAuthenticated, (req, res) => {
    res.render('models/upload', {
        title: 'Upload Model',
        user: req.session.user
    });
});

// Process model upload
router.post('/upload', isAuthenticated, upload.single('model'), async (req, res) => {
    if (!req.file) {
        return res.render('models/upload', {
            title: 'Upload Model',
            user: req.session.user,
            error: 'Please select a model file to upload'
        });
    }

    try {
        const { name, description, isPublic } = req.body;

        let filePath, fileSize, fileType;

        if (isProduction) {
            // In production, we're using Cloudinary
            filePath = req.file.path || req.file.secure_url;
            fileSize = req.file.size;
            fileType = path.extname(req.file.originalname).substring(1);

            console.log('File uploaded to Cloudinary:', filePath);
        } else {
            // In development, we're using local storage
            filePath = path.join(uploadDir, req.file.filename);
            fileSize = req.file.size;
            fileType = path.extname(req.file.originalname).substring(1);
        }

        // Create new model in database
        const newModel = await Model.create({
            name,
            description,
            file_path: filePath,
            file_size: fileSize,
            file_type: fileType,
            user_id: req.session.user._id,
            is_public: isPublic ? true : false
        });

        res.redirect(`/models/${newModel._id}`);
    } catch (error) {
        console.error('Error saving model to database:', error);

    // Delete the uploaded file if database insert fails
        if (!isProduction && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }

        return res.render('models/upload', {
            title: 'Upload Model',
            user: req.session.user,
            error: 'Error saving model to database'
        });
    }
});

// View a single model
router.get('/:id', async (req, res) => {
    try {
        const modelId = req.params.id;

        // Find model and populate owner information
        const model = await Model.findById(modelId)
            .populate('user_id', 'username')
            .lean();

        if (!model) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found',
                error: {}
            });
        }

        // Check if user has permission to view this model
        const userId = req.session.user ? req.session.user._id : null;
        if (!model.is_public && (!userId || model.user_id._id.toString() !== userId.toString())) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to view this model',
                error: {}
            });
        }

        // Get model settings
        const settings = await ModelSetting.findOne({ model_id: modelId }).lean() || {};

        // Get hotspots
        const hotspots = await Hotspot.find({ model_id: modelId }).lean();

        // Format model for template
        const formattedModel = {
            ...model,
            id: model._id,
            owner: model.user_id.username,
            owner_id: model.user_id._id
        };

        res.render('models/view', {
            title: model.name,
            model: formattedModel,
            settings: settings,
            hotspots: hotspots,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error fetching model:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to fetch model',
            error: {}
        });
    }
});

// Show form to edit a model
router.get('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const modelId = req.params.id;

        // Find model
        const model = await Model.findById(modelId).lean();

        if (!model) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found',
                error: {}
            });
        }

        // Check if user is the owner
        if (model.user_id.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to edit this model',
                error: {}
            });
        }

        // Get model settings
        const settings = await ModelSetting.findOne({ model_id: modelId }).lean() || {};

        // Format model for template
        const formattedModel = {
            ...model,
            id: model._id
        };

        res.render('models/edit', {
            title: `Edit ${model.name}`,
            model: formattedModel,
            settings: settings,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching model for edit:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to fetch model',
            error: {}
        });
    }
});

// Process model edit
router.post('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const modelId = req.params.id;
        const { name, description, isPublic,
            cameraOrbit, cameraTarget, fieldOfView,
            exposure, shadowIntensity, shadowSoftness,
            environmentImage, skyboxImage,
            animationName, autoplay } = req.body;

        // Find model
        const model = await Model.findById(modelId);

        if (!model) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found',
                error: {}
            });
        }

        // Check if user is the owner
        if (model.user_id.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to edit this model',
                error: {}
            });
        }

        // Update model
        model.name = name;
        model.description = description;
        model.is_public = isPublic ? true : false;
        await model.save();

        // Find or create model settings
        let settings = await ModelSetting.findOne({ model_id: modelId });

        if (!settings) {
            settings = new ModelSetting({ model_id: modelId });
        }

        // Update settings
        settings.camera_orbit = cameraOrbit;
        settings.camera_target = cameraTarget;
        settings.field_of_view = fieldOfView;
        settings.exposure = exposure;
        settings.shadow_intensity = shadowIntensity;
        settings.shadow_softness = shadowSoftness;
        settings.environment_image = environmentImage;
        settings.skybox_image = skyboxImage;
        settings.animation_name = animationName;
        settings.autoplay = autoplay ? true : false;

        await settings.save();

        res.redirect(`/models/${modelId}`);
    } catch (error) {
        console.error('Error updating model:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to update model',
            error: {}
        });
    }
});

// Update model settings
router.post('/:id/settings', isAuthenticated, (req, res) => {
    const modelId = req.params.id;
    const {
        camera_orbit,
        camera_target,
        field_of_view,
        exposure,
        shadow_intensity,
        shadow_softness,
        environment_image,
        skybox_image,
        animation_name,
        autoplay
    } = req.body;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error checking model ownership:', err);
            return res.status(403).json({ error: 'You do not have permission to edit this model' });
        }

        // Update model settings
        db.run(`
      UPDATE model_settings
      SET camera_orbit = ?,
          camera_target = ?,
          field_of_view = ?,
          exposure = ?,
          shadow_intensity = ?,
          shadow_softness = ?,
          environment_image = ?,
          skybox_image = ?,
          animation_name = ?,
          autoplay = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE model_id = ?
    `, [
            camera_orbit,
            camera_target,
            field_of_view,
            exposure,
            shadow_intensity,
            shadow_softness,
            environment_image,
            skybox_image,
            animation_name,
            autoplay ? 1 : 0,
            modelId
        ], function (err) {
            if (err) {
                console.error('Error updating model settings:', err);
                return res.status(500).json({ error: 'Failed to update model settings' });
            }

            // Also update the model's updated_at timestamp
            db.run('UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [modelId]);

            res.json({ success: true });
        });
    });
});

// Add hotspot
router.post('/:id/hotspots', isAuthenticated, (req, res) => {
    const modelId = req.params.id;
    const { name, position, normal, surface, content } = req.body;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error checking model ownership:', err);
            return res.status(403).json({ error: 'You do not have permission to edit this model' });
        }

        // Add hotspot
        db.run(`
      INSERT INTO hotspots (model_id, name, position, normal, surface, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [modelId, name, position, normal, surface, content], function (err) {
            if (err) {
                console.error('Error adding hotspot:', err);
                return res.status(500).json({ error: 'Failed to add hotspot' });
            }

            const hotspotId = this.lastID;

            // Also update the model's updated_at timestamp
            db.run('UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [modelId]);

            res.json({ success: true, id: hotspotId });
        });
    });
});

// Update hotspot
router.put('/:id/hotspots/:hotspotId', isAuthenticated, (req, res) => {
    const modelId = req.params.id;
    const hotspotId = req.params.hotspotId;
    const { name, position, normal, surface, content } = req.body;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error checking model ownership:', err);
            return res.status(403).json({ error: 'You do not have permission to edit this model' });
        }

        // Update hotspot
        db.run(`
      UPDATE hotspots
      SET name = ?, position = ?, normal = ?, surface = ?, content = ?
      WHERE id = ? AND model_id = ?
    `, [name, position, normal, surface, content, hotspotId, modelId], function (err) {
            if (err) {
                console.error('Error updating hotspot:', err);
                return res.status(500).json({ error: 'Failed to update hotspot' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Hotspot not found' });
            }

            // Also update the model's updated_at timestamp
            db.run('UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [modelId]);

            res.json({ success: true });
        });
    });
});

// Delete hotspot
router.delete('/:id/hotspots/:hotspotId', isAuthenticated, (req, res) => {
    const modelId = req.params.id;
    const hotspotId = req.params.hotspotId;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error checking model ownership:', err);
            return res.status(403).json({ error: 'You do not have permission to edit this model' });
        }

        // Delete hotspot
        db.run('DELETE FROM hotspots WHERE id = ? AND model_id = ?', [hotspotId, modelId], function (err) {
            if (err) {
                console.error('Error deleting hotspot:', err);
                return res.status(500).json({ error: 'Failed to delete hotspot' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Hotspot not found' });
            }

            // Also update the model's updated_at timestamp
            db.run('UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [modelId]);

            res.json({ success: true });
        });
    });
});

// Delete model
router.post('/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const modelId = req.params.id;

        // Find model
        const model = await Model.findById(modelId);

        if (!model) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found',
                error: {}
            });
        }

        // Check if user is the owner
        if (model.user_id.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to delete this model',
                error: {}
            });
        }

        // Delete model file
        if (!isProduction && !model.file_path.startsWith('memory://') && fs.existsSync(model.file_path)) {
            fs.unlink(model.file_path, (err) => {
                if (err) console.error('Error deleting model file:', err);
            });
        } else if (isProduction && model.file_path) {
            // In production, delete from Cloudinary
            try {
                const { cloudinary } = require('../upload-cloud');
                // Extract public_id from the Cloudinary URL
                const urlParts = model.file_path.split('/');
                const publicId = `3d-models/${urlParts[urlParts.length - 1].split('.')[0]}`;

                cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }, (error, result) => {
                    if (error) {
                        console.error('Error deleting file from Cloudinary:', error);
                    } else {
                        console.log('File deleted from Cloudinary:', result);
                    }
                });
            } catch (error) {
                console.error('Error with Cloudinary delete:', error);
            }
        }

        // Delete the thumbnail if it exists
        if (!isProduction && model.thumbnail_path && fs.existsSync(model.thumbnail_path)) {
            fs.unlink(model.thumbnail_path, (err) => {
                if (err) console.error('Error deleting thumbnail:', err);
            });
        } else if (isProduction && model.thumbnail_path) {
            // In production, delete thumbnail from Cloudinary
            try {
                const { cloudinary } = require('../upload-cloud');
                // Extract public_id from the Cloudinary URL
                const urlParts = model.thumbnail_path.split('/');
                const publicId = `model-images/${urlParts[urlParts.length - 1].split('.')[0]}`;

                cloudinary.uploader.destroy(publicId, (error, result) => {
                    if (error) {
                        console.error('Error deleting thumbnail from Cloudinary:', error);
                    } else {
                        console.log('Thumbnail deleted from Cloudinary:', result);
                    }
                });
            } catch (error) {
                console.error('Error with Cloudinary thumbnail delete:', error);
            }
        }

        // Delete related data
        await ModelSetting.deleteOne({ model_id: modelId });
        await Hotspot.deleteMany({ model_id: modelId });

        // Delete the model
        await Model.deleteOne({ _id: modelId });

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error deleting model:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to delete model',
            error: {}
        });
    }
});

// Generate embed code
router.get('/:id/embed', (req, res) => {
    const modelId = req.params.id;

    db.get(`
    SELECT m.*, ms.*
    FROM models m
    LEFT JOIN model_settings ms ON m.id = ms.model_id
    WHERE m.id = ? AND m.is_public = 1
  `, [modelId], (err, model) => {
        if (err || !model) {
            console.error('Error fetching model for embed:', err);
            return res.status(404).json({ error: 'Model not found or not public' });
        }

        // Generate embed code
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const modelUrl = `${baseUrl}/${model.file_path}`;

        let embedCode = `<model-viewer src="${modelUrl}" `;

        // Add camera settings
        if (model.camera_orbit) embedCode += `camera-orbit="${model.camera_orbit}" `;
        if (model.camera_target) embedCode += `camera-target="${model.camera_target}" `;
        if (model.field_of_view) embedCode += `field-of-view="${model.field_of_view}" `;

        // Add lighting settings
        if (model.exposure) embedCode += `exposure="${model.exposure}" `;
        if (model.shadow_intensity) embedCode += `shadow-intensity="${model.shadow_intensity}" `;
        if (model.shadow_softness) embedCode += `shadow-softness="${model.shadow_softness}" `;

        // Add environment and skybox
        if (model.environment_image) embedCode += `environment-image="${model.environment_image}" `;
        if (model.skybox_image) embedCode += `skybox-image="${model.skybox_image}" `;

        // Add animation settings
        if (model.animation_name) embedCode += `animation-name="${model.animation_name}" `;
        if (model.autoplay) embedCode += `autoplay `;

        // Add standard attributes
        embedCode += `camera-controls ar ar-modes="webxr scene-viewer quick-look" `;
        embedCode += `alt="${model.name}" `;
        embedCode += `style="width: 100%; height: 400px;"`;

        // Close tag
        embedCode += `></model-viewer>`;

        // Add script tag for model-viewer
        embedCode += `\n<script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>`;

        res.json({ embedCode });
    });
});

module.exports = router; 