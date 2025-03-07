const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { isAuthenticated } = require('../middleware/auth');

// Home page - show public models
router.get('/', (req, res) => {
    db.all(`
    SELECT m.*, u.username as owner
    FROM models m
    JOIN users u ON m.user_id = u.id
    WHERE m.is_public = 1
    ORDER BY m.created_at DESC
  `, (err, models) => {
        if (err) {
            console.error('Error fetching public models:', err);
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to fetch models'
            });
        }

        res.render('index', {
            title: '3D Model Manager',
            models: models,
            user: req.session.user || null
        });
    });
});

// Dashboard - requires authentication
router.get('/dashboard', isAuthenticated, (req, res) => {
    db.all(`
    SELECT m.*, 
           (SELECT COUNT(*) FROM hotspots WHERE model_id = m.id) as hotspot_count
    FROM models m
    WHERE m.user_id = ?
    ORDER BY m.updated_at DESC
  `, [req.session.user.id], (err, models) => {
        if (err) {
            console.error('Error fetching user models:', err);
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to fetch models'
            });
        }

        res.render('dashboard', {
            title: 'Dashboard',
            models: models,
            user: req.session.user
        });
    });
});

module.exports = router; 