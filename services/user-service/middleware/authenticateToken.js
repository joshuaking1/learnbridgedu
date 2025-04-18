// services/user-service/middleware/authenticateToken.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    // Get token from the Authorization header (e.g., "Bearer TOKEN")
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract the token part

    if (token == null) {
        // No token provided
        return res.status(401).json({ error: 'Unauthorized: Access token is missing.' });
    }

    // Verify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            // Token is invalid (expired, wrong signature, etc.)
            console.error("JWT Verification Error:", err.message); // Log the specific error
            if (err.name === 'TokenExpiredError') {
                 return res.status(403).json({ error: 'Forbidden: Access token has expired.' });
            }
             return res.status(403).json({ error: 'Forbidden: Invalid access token.' });
        }

        // Token is valid, attach the payload to the request object
        // The payload contains { userId, email, role } - whatever we put in it during login
        req.user = user;
        console.log("Token verified for user:", user.userId, "Role:", user.role); // Log successful verification

        // Proceed to the next middleware or the route handler
        next();
    });
}

module.exports = authenticateToken;