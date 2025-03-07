const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { isAuthenticated } = require('../middleware/auth');

// Configure multer for file uploads
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

const upload = multer({
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

// List all models (public or owned by user)
router.get('/', (req, res) => {
    const userId = req.session.user ? req.session.user.id : null;

    let query = `
    SELECT m.*, u.username as owner
    FROM models m
    JOIN users u ON m.user_id = u.id
    WHERE m.is_public = 1
  `;

    const params = [];

    if (userId) {
        query = `
      SELECT m.*, u.username as owner
      FROM models m
      JOIN users u ON m.user_id = u.id
      WHERE m.is_public = 1 OR m.user_id = ?
    `;
        params.push(userId);
    }

    query += ' ORDER BY m.created_at DESC';

    db.all(query, params, (err, models) => {
        if (err) {
            console.error('Error fetching models:', err);
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to fetch models'
            });
        }

        res.render('models/index', {
            title: 'All Models',
            models: models,
            user: req.session.user || null
        });
    });
});

// Show form to upload a new model
router.get('/upload', isAuthenticated, (req, res) => {
    res.render('models/upload', {
        title: 'Upload Model',
        user: req.session.user
    });
});

// Process model upload
router.post('/upload', isAuthenticated, upload.single('model'), (req, res) => {
    if (!req.file) {
        return res.render('models/upload', {
            title: 'Upload Model',
            user: req.session.user,
            error: 'Please select a model file to upload'
        });
    }

    const { name, description, isPublic } = req.body;
    const filePath = path.join(uploadDir, req.file.filename);
    const fileSize = req.file.size;
    const fileType = path.extname(req.file.originalname).substring(1);

    db.run(`
    INSERT INTO models (
      name, description, file_path, file_size, file_type, 
      user_id, is_public
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
        name,
        description,
        filePath,
        fileSize,
        fileType,
        req.session.user.id,
        isPublic ? 1 : 0
    ], function (err) {
        if (err) {
            console.error('Error saving model to database:', err);
            // Delete the uploaded file if database insert fails
            fs.unlink(filePath, () => { });
            return res.render('models/upload', {
                title: 'Upload Model',
                user: req.session.user,
                error: 'Failed to save model'
            });
        }

        const modelId = this.lastID;

        // Create default model settings
        db.run(`
      INSERT INTO model_settings (
        model_id, camera_orbit, camera_target, field_of_view,
        exposure, shadow_intensity, shadow_softness
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
            modelId,
            '0deg 75deg 2m', // Default camera orbit
            '0m 0m 0m',      // Default camera target
            '45deg',         // Default FOV
            '1',             // Default exposure
            '0.7',           // Default shadow intensity
            '1'              // Default shadow softness
        ], (err) => {
            if (err) {
                console.error('Error creating default model settings:', err);
            }

            res.redirect(`/models/${modelId}`);
        });
    });
});

// View a single model
router.get('/:id', (req, res) => {
    const modelId = req.params.id;
    const userId = req.session.user ? req.session.user.id : null;

    // Get model, settings, and hotspots
    db.get(`
    SELECT m.*, u.username as owner, ms.*
    FROM models m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN model_settings ms ON m.id = ms.model_id
    WHERE m.id = ?
  `, [modelId], (err, model) => {
        if (err || !model) {
            console.error('Error fetching model:', err);
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found'
            });
        }

        // Check if user has access to this model
        if (!model.is_public && (!userId || model.user_id !== userId)) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to view this model'
            });
        }

        // Get hotspots for this model
        db.all('SELECT * FROM hotspots WHERE model_id = ?', [modelId], (err, hotspots) => {
            if (err) {
                console.error('Error fetching hotspots:', err);
                hotspots = [];
            }

            // Check if user is the owner
            const isOwner = userId && model.user_id === userId;

            res.render('models/view', {
                title: model.name,
                model: model,
                hotspots: hotspots,
                isOwner: isOwner,
                user: req.session.user || null
            });
        });
    });
});

// Show form to edit model
router.get('/:id/edit', isAuthenticated, (req, res) => {
    const modelId = req.params.id;

    db.get(`
    SELECT m.*, ms.*
    FROM models m
    LEFT JOIN model_settings ms ON m.id = ms.model_id
    WHERE m.id = ? AND m.user_id = ?
  `, [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error fetching model for edit:', err);
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Model not found or you do not have permission to edit it'
            });
        }

        res.render('models/edit', {
            title: `Edit ${model.name}`,
            model: model,
            user: req.session.user
        });
    });
});

// Update model
router.post('/:id/edit', isAuthenticated, (req, res) => {
    const modelId = req.params.id;
    const { name, description, isPublic } = req.body;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err || !model) {
            console.error('Error checking model ownership:', err);
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to edit this model'
            });
        }

        // Update model details
        db.run(`
      UPDATE models
      SET name = ?, description = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, description, isPublic ? 1 : 0, modelId], function (err) {
            if (err) {
                console.error('Error updating model:', err);
                return res.render('models/edit', {
                    title: `Edit ${model.name}`,
                    model: model,
                    user: req.session.user,
                    error: 'Failed to update model'
                });
            }

            res.redirect(`/models/${modelId}`);
        });
    });
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
router.delete('/:id', isAuthenticated, (req, res) => {
    const modelId = req.params.id;

    // First check if user owns this model
    db.get('SELECT * FROM models WHERE id = ? AND user_id = ?', [modelId, req.session.user.id], (err, model) => {
        if (err) {
            console.error('Error checking model ownership:', err);
            return res.status(403).json({ error: 'You do not have permission to delete this model' });
        }

        if (!model) {
            return res.status(404).json({ error: 'Model not found' });
        }

        // Begin transaction
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
                console.error('Error beginning transaction:', err);
                return res.status(500).json({ error: 'Failed to delete model' });
            }

            // Delete hotspots
            db.run('DELETE FROM hotspots WHERE model_id = ?', [modelId], (err) => {
                if (err) {
                    console.error('Error deleting hotspots:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to delete model' });
                }

                // Delete model settings
                db.run('DELETE FROM model_settings WHERE model_id = ?', [modelId], (err) => {
                    if (err) {
                        console.error('Error deleting model settings:', err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to delete model' });
                    }

                    // Delete model
                    db.run('DELETE FROM models WHERE id = ?', [modelId], function (err) {
                        if (err) {
                            console.error('Error deleting model:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to delete model' });
                        }

                        // Commit transaction
                        db.run('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Failed to delete model' });
                            }

                            // Delete model file
                            if (model.file_path) {
                                fs.unlink(model.file_path, (err) => {
                                    if (err) {
                                        console.error('Error deleting model file:', err);
                                    }
                                });
                            }

                            // Delete thumbnail if exists
                            if (model.thumbnail_path) {
                                fs.unlink(model.thumbnail_path, (err) => {
                                    if (err) {
                                        console.error('Error deleting thumbnail file:', err);
                                    }
                                });
                            }

                            res.json({ success: true });
                        });
                    });
                });
            });
        });
    });
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