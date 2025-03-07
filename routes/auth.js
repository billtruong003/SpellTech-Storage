const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../db');
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
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/auth/login?error=Please provide username and password');
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.redirect('/auth/login?error=An error occurred');
        }

        if (!user) {
            return res.redirect('/auth/login?error=Invalid username or password');
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.redirect('/auth/login?error=An error occurred');
            }

            if (!result) {
                return res.redirect('/auth/login?error=Invalid username or password');
            }

            // Store user in session (excluding password)
            const { password, ...userWithoutPassword } = user;
            req.session.user = userWithoutPassword;

            res.redirect('/dashboard');
        });
    });
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
router.post('/register', (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    // Basic validation
    if (!username || !email || !password) {
        return res.redirect('/auth/register?error=Please fill all required fields');
    }

    if (password !== confirmPassword) {
        return res.redirect('/auth/register?error=Passwords do not match');
    }

    // Check if username or email already exists
    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, existingUser) => {
        if (err) {
            console.error('Database error during registration:', err);
            return res.redirect('/auth/register?error=An error occurred');
        }

        if (existingUser) {
            return res.redirect('/auth/register?error=Username or email already in use');
        }

        // Hash password and create user
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.redirect('/auth/register?error=An error occurred');
            }

            db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hash],
                function (err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return res.redirect('/auth/register?error=Failed to create user');
                    }

                    // Log in the new user
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, user) => {
                        if (err || !user) {
                            console.error('Error fetching new user:', err);
                            return res.redirect('/auth/login?message=Registration successful. Please log in.');
                        }

                        // Store user in session (excluding password)
                        const { password, ...userWithoutPassword } = user;
                        req.session.user = userWithoutPassword;

                        res.redirect('/dashboard');
                    });
                }
            );
        });
    });
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
router.post('/profile', isAuthenticated, (req, res) => {
    const { email, currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user.id;

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
        db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
            if (err || !user) {
                console.error('Error fetching user for password update:', err);
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'Failed to update profile'
                });
            }

            bcrypt.compare(currentPassword, user.password, (err, result) => {
                if (err || !result) {
                    return res.render('profile', {
                        title: 'My Profile',
                        user: req.session.user,
                        error: 'Current password is incorrect'
                    });
                }

                // Hash and update new password
                bcrypt.hash(newPassword, 10, (err, hash) => {
                    if (err) {
                        console.error('Error hashing new password:', err);
                        return res.render('profile', {
                            title: 'My Profile',
                            user: req.session.user,
                            error: 'Failed to update password'
                        });
                    }

                    db.run('UPDATE users SET email = ?, password = ? WHERE id = ?', [email, hash, userId], function (err) {
                        if (err) {
                            console.error('Error updating profile with new password:', err);
                            return res.render('profile', {
                                title: 'My Profile',
                                user: req.session.user,
                                error: 'Failed to update profile'
                            });
                        }

                        // Update session
                        req.session.user.email = email;

                        res.render('profile', {
                            title: 'My Profile',
                            user: req.session.user,
                            success: 'Profile updated successfully'
                        });
                    });
                });
            });
        });
    } else {
        // Just update email
        db.run('UPDATE users SET email = ? WHERE id = ?', [email, userId], function (err) {
            if (err) {
                console.error('Error updating email:', err);
                return res.render('profile', {
                    title: 'My Profile',
                    user: req.session.user,
                    error: 'Failed to update profile'
                });
            }

            // Update session
            req.session.user.email = email;

            res.render('profile', {
                title: 'My Profile',
                user: req.session.user,
                success: 'Profile updated successfully'
            });
        });
    }
});

module.exports = router; 