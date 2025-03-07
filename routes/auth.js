const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { User } = require('../models');
const { isAuthenticated } = require('../middleware/auth');

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', {
        title: 'Login',
        error: req.query.error || null,
        message: req.query.message || null
    });
});

// Login process
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/auth/login?error=Please provide username and password');
    }

    try {
        // Find user by username
        const user = await User.findOne({ username });

        if (!user) {
            return res.redirect('/auth/login?error=Invalid username or password');
        }

        // Compare password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.redirect('/auth/login?error=Invalid username or password');
        }

        // Store user in session (excluding password)
        const userObject = user.toObject();
        delete userObject.password;
        req.session.user = userObject;

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during login:', error);
        res.redirect('/auth/login?error=An error occurred');
    }
});

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', {
        title: 'Register',
        error: req.query.error || null
    });
});

// Register process
router.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    // Basic validation
    if (!username || !email || !password) {
        return res.redirect('/auth/register?error=Please fill all required fields');
    }

    if (password !== confirmPassword) {
        return res.redirect('/auth/register?error=Passwords do not match');
    }

    try {
        // Check if username or email already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.redirect('/auth/register?error=Username or email already in use');
        }

        // Create new user
        const newUser = await User.create({
            username,
            email,
            password
        });

        // Store user in session (excluding password)
        const userObject = newUser.toObject();
        delete userObject.password;
        req.session.user = userObject;

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during registration:', error);
        res.redirect('/auth/register?error=An error occurred');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

// Profile page
router.get('/profile', isAuthenticated, (req, res) => {
    res.render('profile', {
        title: 'My Profile',
        user: req.session.user
    });
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
    const { email, currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user._id;

    try {
        // Get user from database
        const user = await User.findById(userId);

        if (!user) {
            return res.render('profile', {
                title: 'My Profile',
                user: req.session.user,
                error: 'User not found'
            });
        }

        // If updating password
        if (currentPassword && newPassword) {
            if (newPassword !== confirmPassword) {
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'New passwords do not match'
                });
            }

            // Verify current password
            const isMatch = await user.comparePassword(currentPassword);

            if (!isMatch) {
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'Current password is incorrect'
                });
            }

            // Update user
            user.email = email;
            user.password = newPassword;
            await user.save();
        } else {
            // Just update email
            user.email = email;
            await user.save();
        }

        // Update session
        req.session.user.email = email;

        res.render('profile', {
            title: 'My Profile',
            user: req.session.user,
            success: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.render('profile', {
            title: 'My Profile',
            user: req.session.user,
            error: 'Failed to update profile'
        });
    }
});

module.exports = router; 