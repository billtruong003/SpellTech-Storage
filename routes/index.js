const express = require('express');
const router = express.Router();
const { Model, User } = require('../models');
const { isAuthenticated } = require('../middleware/auth');
const mongoose = require('mongoose');

// Home page - show public models
router.get('/', async (req, res) => {
    try {
        // Find all public models and populate owner information
        const models = await Model.find({ is_public: true })
            .sort({ created_at: -1 })
            .populate('user_id', 'username')
            .lean();

        // Format models for template
        const formattedModels = models.map(model => ({
            ...model,
            owner: model.user_id.username,
            id: model._id
        }));

        res.render('index', {
            title: '3D Model Manager',
            models: formattedModels,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error fetching public models:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to fetch models'
        });
    }
});

// Dashboard - requires authentication
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        // Find all models for the current user
        const models = await Model.find({ user_id: req.session.user._id })
            .sort({ updated_at: -1 })
            .lean();

        // Get hotspot counts for each model
        const modelsWithCounts = await Promise.all(models.map(async model => {
            // Count hotspots for this model
            const hotspotCount = await mongoose.model('Hotspot').countDocuments({ model_id: model._id });

            return {
                ...model,
                id: model._id,
                hotspot_count: hotspotCount
            };
        }));

        res.render('dashboard', {
            title: 'Dashboard',
            models: modelsWithCounts,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching user models:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to fetch models'
        });
    }
});

module.exports = router; 