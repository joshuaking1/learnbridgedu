// services/teacher-tools-service/routes/usageLimits.js
const express = require('express');
const usageLimitService = require('../services/usageLimitService');

const router = express.Router();

// --- Get User's Usage Limits ---
// GET /api/teacher-tools/limits
router.get('/', async (req, res) => {
    const user = req.user;
    
    console.log(`[TeacherToolsService] Request for usage limits from user ${user.userId}`);
    
    try {
        const usageStats = await usageLimitService.getUserUsageStats(user);
        res.status(200).json(usageStats);
    } catch (error) {
        console.error(`[TeacherToolsService] Error fetching usage limits for user ${user.userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching usage limits.' });
    }
});

module.exports = router;
