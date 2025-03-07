/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }

    // If AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Redirect to login page
    res.redirect('/auth/login?error=Please log in to access this page');
}

/**
 * Middleware to check if user is admin
 */
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    // If AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Redirect to home page
    res.status(403).render('error', { message: 'You do not have permission to access this page' });
}

module.exports = {
    isAuthenticated,
    isAdmin
}; 