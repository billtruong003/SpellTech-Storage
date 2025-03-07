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

// Handle file upload
router.post('/', isAuthenticated, upload.single('model_file'), async (req, res) => {
    try {
        // Get form data
        const { name, description, is_public } = req.body;

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).render('error', {
                title: 'Error',
                message: 'No file uploaded',
                error: {}
            });
        }

        console.log('File uploaded to Cloudinary:', req.file.path);

        // Create new model
        const newModel = new Model({
            name,
            description,
            user_id: req.session.user._id,
            is_public: is_public === 'on',
            file_path: req.file.path, // Use the full path from Cloudinary
            file_type: path.extname(req.file.originalname).substring(1),
            file_size: req.file.size
        });

        // Save model to database
        await newModel.save();

        // Redirect to model page
        res.redirect(`/models/${newModel._id}`);
    } catch (error) {
        console.error('Error creating model:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error creating model',
            error: process.env.NODE_ENV === 'development' ? error : {}
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
            owner_id: model.user_id._id,
            file_path: model.file_path.startsWith('https://') ? model.file_path : `/${model.file_path}`
        };

        res.render('models/view', {
            title: model.name,
            model: formattedModel,
            settings: settings,
            hotspots: hotspots,
            user: req.session.user || null,
            isOwner: req.session.user && req.session.user._id.toString() === model.user_id._id.toString()
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
router.post('/:id/settings', isAuthenticated, async (req, res) => {
    try {
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
        const model = await Model.findOne({
            _id: modelId,
            user_id: req.session.user._id
        });

        if (!model) {
            return res.status(403).json({ error: 'You do not have permission to edit this model' });
        }

        // Find or create model settings
        let settings = await ModelSetting.findOne({ model_id: modelId });

        if (!settings) {
            settings = new ModelSetting({ model_id: modelId });
        }

        // Update settings
        settings.camera_orbit = camera_orbit;
        settings.camera_target = camera_target;
        settings.field_of_view = field_of_view;
        settings.exposure = exposure;
        settings.shadow_intensity = shadow_intensity;
        settings.shadow_softness = shadow_softness;
        settings.environment_image = environment_image;
        settings.skybox_image = skybox_image;
        settings.animation_name = animation_name;
        settings.autoplay = autoplay ? true : false;

        await settings.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating model settings:', error);
        res.status(500).json({ error: 'Failed to update model settings' });
    }
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
router.get('/:id/embed', async (req, res) => {
    try {
        const modelId = req.params.id;

        // Use MongoDB instead of SQLite
        const model = await Model.findOne({
            _id: modelId,
            is_public: true 
        }).populate('user_id').lean();

        if (!model) {
            return res.status(404).json({ error: 'Model not found or not public' });
        }

        const settings = await ModelSetting.findOne({ model_id: modelId }).lean() || {};

        // Use direct Cloudinary URL if available, ensure it's not prefixed with the host
        const modelUrl = model.file_path.startsWith('https://')
            ? model.file_path
            : `${req.protocol}://${req.get('host')}/${model.file_path}`;

        // Create embed code with model-viewer
        const embedCode = `<div style="border: 1px solid #ddd; border-radius: 8px; padding: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); max-width: 800px; margin: 0 auto;">
            <div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
                <model-viewer src="${modelUrl}" 
                    alt="${model.name}" 
                    camera-controls 
                    ${settings.autoplay ? 'autoplay' : ''} 
                    ${settings.animation_name ? `animation-name="${settings.animation_name}"` : ''} 
                    camera-orbit="${settings.camera_orbit || '0deg 75deg 2m'}" 
                    camera-target="${settings.camera_target || '0m 0m 0m'}" 
                    field-of-view="${settings.field_of_view || '45deg'}" 
                    exposure="${settings.exposure || '1'}" 
                    shadow-intensity="${settings.shadow_intensity || '0.7'}" 
                    shadow-softness="${settings.shadow_softness || '1'}" 
                    ${settings.environment_image ? `environment-image="${settings.environment_image}"` : ''} 
                    ${settings.skybox_image ? `skybox-image="${settings.skybox_image}"` : ''} 
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 4px;">
                </model-viewer>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                <span style="font-size: 14px; color: #666;">${model.name}</span>
                <a href="${req.protocol}://${req.get('host')}/models/${model._id}" style="font-size: 12px; color: #3498db; text-decoration: none;" target="_blank">View on 3D Model Manager</a>
            </div>
        </div>
        <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>`;

        res.json({ success: true, embedCode });
    } catch (error) {
        console.error('Error generating embed code:', error);
        res.status(500).json({ error: 'Error generating embed code' });
    }
});

module.exports = router; 