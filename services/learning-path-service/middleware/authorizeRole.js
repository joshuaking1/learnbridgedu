// services/learning-path-service/middleware/authorizeRole.js

/**
 * Middleware to authorize users based on their role
 * @param {string[]} allowedRoles - Array of roles allowed to access the route
 * @returns {function} Middleware function
 */
function authorizeRole(allowedRoles) {
    return (req, res, next) => {
        // User info should be set by authenticateToken middleware
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const userRole = req.user.role;
        
        // Check if user's role is in the allowed roles
        if (allowedRoles.includes(userRole)) {
            next(); // Role is allowed, proceed
        } else {
            console.warn(`[LearningPathService] Access denied for user ${req.user.userId} with role ${userRole}. Allowed roles: ${allowedRoles.join(', ')}`);
            res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
    };
}

module.exports = authorizeRole;
