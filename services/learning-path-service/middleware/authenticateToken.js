// services/learning-path-service/middleware/authenticateToken.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    // Get the auth header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('[LearningPathService] Token verification error:', err.message);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        
        // Token is valid, set user info in request
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;
