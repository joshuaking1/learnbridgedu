// services/auth-service/middleware/authenticateToken.js
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../logger');

function authenticateToken(req, res, next) {
    // Get token from the Authorization header (e.g., "Bearer TOKEN")
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract the token part

    if (token == null) {
        // No token provided
        return res.status(401).json({ error: 'Unauthorized: Access token is missing.' });
    }

    // Verify the token
    jwt.verify(token, config.jwt.secret, (err, user) => {
        if (err) {
            // Token is invalid (expired, wrong signature, etc.)
            logger.warn("JWT Verification Error:", {
                userId: user?.userId || 'unknown',
                error: err.message,
                errorType: err.name
            });
            
            if (err.name === 'TokenExpiredError') {
                 return res.status(403).json({ error: 'Forbidden: Access token has expired.' });
            } else if (err.name === 'JsonWebTokenError') {
                 return res.status(403).json({ error: 'Forbidden: Invalid access token.' });
            } else {
                 return res.status(403).json({ error: 'Forbidden: Token verification failed.' });
            }
        }

        // Token is valid, attach the payload to the request object
        // The payload contains { userId, email, role } - whatever we put in it during login
        req.user = user;
        logger.debug("Token verified successfully", {
            userId: user.userId,
            role: user.role,
            ip: req.ip
        });

        // Proceed to the next middleware or the route handler
        next();
    });
}

module.exports = authenticateToken;