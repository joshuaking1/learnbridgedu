// services/learning-path-service/routes/usageLimits.js
const express = require('express');
const router = express.Router();
const usageLimitService = require('../services/usageLimitService');

// --- Get Usage Limits for All Services ---
// GET /api/learning-paths/limits
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get usage limits for user ${userId}`);
    
    try {
        const limits = await usageLimitService.getAllServiceLimits(req.user);
        
        console.log(`[LearningPathService] Retrieved usage limits for user ${userId}`);
        res.status(200).json(limits);
    } catch (error) {
        console.error(`[LearningPathService] Error getting usage limits:`, error);
        res.status(500).json({ error: 'Failed to retrieve usage limits' });
    }
});

// --- Get Usage Limit for Specific Service ---
// GET /api/learning-paths/limits/:service
router.get('/:service', async (req, res) => {
    const userId = req.user.userId;
    const serviceName = req.params.service;
    
    console.log(`[LearningPathService] Received request to get usage limit for service ${serviceName} for user ${userId}`);
    
    try {
        // Check if service exists
        if (!Object.values(usageLimitService.SERVICES).includes(serviceName)) {
            return res.status(404).json({ error: 'Service not found' });
        }
        
        const limit = await usageLimitService.checkUserLimit(req.user, serviceName);
        
        console.log(`[LearningPathService] Retrieved usage limit for service ${serviceName} for user ${userId}`);
        res.status(200).json(limit);
    } catch (error) {
        console.error(`[LearningPathService] Error getting usage limit for service ${serviceName}:`, error);
        res.status(500).json({ error: 'Failed to retrieve usage limit' });
    }
});

module.exports = router;
