// services/auth-service/routes/loginHistoryRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/authenticateToken');
const logger = require('../logger');

// Get login history (GET /api/auth/login-history)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get login history for the user
        const result = await db.query(
            `SELECT 
                id, 
                user_id, 
                timestamp, 
                ip_address as "ipAddress", 
                user_agent as "device", 
                successful, 
                failure_reason as "failureReason"
            FROM login_attempts 
            WHERE user_id = $1 
            ORDER BY timestamp DESC 
            LIMIT 10`,
            [userId]
        );

        res.status(200).json({
            loginHistory: result.rows
        });
    } catch (err) {
        logger.error('Error getting login history:', err);
        res.status(500).json({ error: 'Failed to get login history' });
    }
});

module.exports = router;
