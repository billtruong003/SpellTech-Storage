const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { User } = require('../models');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for avatar uploads
const isProduction = process.env.NODE_ENV === 'production';
let uploadAvatar;

if (isProduction) {
    // Use Cloudinary in production
    const { uploadAvatar: cloudinaryUploadAvatar } = require('../upload-cloud');
    uploadAvatar = cloudinaryUploadAvatar;
} else {
    // Configure multer for local file uploads in development
    const avatarDir = path.join(process.env.UPLOAD_DIR || 'uploads', 'avatars');

    // Create directory if it doesn't exist
    if (!fs.existsSync(avatarDir)) {
        fs.mkdirSync(avatarDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, avatarDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, 'avatar-' + uniqueSuffix + ext);
        }
    });

    uploadAvatar = multer({
        storage: storage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
        fileFilter: function (req, file, cb) {
            const filetypes = /jpeg|jpg|png|webp/;
            const mimetype = filetypes.test(file.mimetype);
            const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

            if (mimetype && extname) {
                return cb(null, true);
            }
            cb(new Error('Only .png, .jpg, .jpeg, and .webp files are allowed'));
        }
    }).single('avatar');
}

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
    const { email, bio, currentPassword, newPassword, confirmPassword } = req.body;
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
            user.bio = bio;
            user.password = newPassword;
            await user.save();
        } else {
            // Just update email and bio
            user.email = email;
            user.bio = bio;
            await user.save();
        }

        // Update session
        req.session.user.email = email;
        req.session.user.bio = bio;

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

// Upload avatar
router.post('/profile/avatar', isAuthenticated, async (req, res) => {
    uploadAvatar(req, res, async function (err) {
        if (err) {
            console.error('Error uploading avatar:', err);
            return res.render('profile', {
                title: 'My Profile',
                user: req.session.user,
                error: err.message || 'Error uploading avatar'
            });
        }

        try {
            if (!req.file) {
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'No file selected'
                });
            }

            const userId = req.session.user._id;
            const user = await User.findById(userId);

            if (!user) {
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'User not found'
                });
            }

            // If using local storage
            if (!isProduction) {
                // Delete old avatar if exists
                if (user.avatar_url && !user.avatar_url.startsWith('http')) {
                    const oldAvatarPath = path.join(process.cwd(), user.avatar_url);
                    if (fs.existsSync(oldAvatarPath)) {
                        fs.unlinkSync(oldAvatarPath);
                    }
                }

                // Set new avatar path
                user.avatar_url = path.join('uploads', 'avatars', req.file.filename).replace(/\\/g, '/');
            } else {
                // In production, Cloudinary URL is already set in req.file.path
                user.avatar_url = req.file.path;
            }

            await user.save();

            // Update session
            req.session.user.avatar_url = user.avatar_url;

            res.render('profile', {
                title: 'My Profile',
                user: req.session.user,
                success: 'Profile picture updated successfully'
            });
        } catch (error) {
            console.error('Error saving avatar:', error);
            res.render('profile', {
                title: 'My Profile',
                user: req.session.user,
                error: 'Failed to update profile picture'
            });
        }
    });
});

module.exports = router; 