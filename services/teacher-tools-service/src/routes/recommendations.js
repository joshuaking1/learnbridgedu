const express = require('express');
const router = express.Router({ mergeParams: true });
const recommendationService = require('../services/recommendationService');
const authenticateToken = require('../../middleware/authenticateToken');

/**
 * GET /api/teacher-tools/recommendations
 * Get personalized resource recommendations
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { subject, grade, resourceType } = req.query;
        const recommendations = await recommendationService.getRecommendations(
            req.user.id,
            { subject, grade, resourceType }
        );
        res.json(recommendations);
    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

/**
 * POST /api/teacher-tools/recommendations
 * Create a new recommendation
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        // Assuming req.user contains id and name from authenticateToken middleware
        const userId = req.user.id;
        const authorName = req.user.name || 'Teacher'; // Fallback if name is not directly available

        const recommendationData = req.body;

        // Basic validation (can be expanded with a validation library like Joi)
        const requiredFields = ['title', 'resource_type', 'subject', 'grade_level', 'content_format', 'content_data'];
        for (const field of requiredFields) {
            if (!recommendationData[field]) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }

        const newRecommendation = await recommendationService.createRecommendation(
            userId,
            authorName,
            recommendationData
        );
        res.status(201).json(newRecommendation);
    } catch (error) {
        console.error('Error creating recommendation:', error);
        if (error.message.includes('Missing required field')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to create recommendation' });
        }
    }
});

/**
 * POST /api/teacher-tools/recommendations/feedback
 * Submit feedback for a recommendation
 */
router.post('/feedback', authenticateToken, async (req, res) => {
    try {
        const { recommendationId, helpful, feedback } = req.body;
        await recommendationService.submitFeedback(
            req.user.id,
            recommendationId,
            { helpful, comments: feedback }
        );
        res.json({ message: 'Feedback submitted successfully' });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

/**
 * GET /api/teacher-tools/recommendations/:id
 * Get a single recommendation by its ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const recommendation = await recommendationService.getRecommendationById(id);
        if (!recommendation) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }
        res.json(recommendation);
    } catch (error) {
        console.error('Error getting recommendation by ID:', error);
        res.status(500).json({ error: 'Failed to fetch recommendation' });
    }
});

/**
 * PUT /api/teacher-tools/recommendations/:id
 * Update an existing recommendation
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id; // From authenticateToken
        const recommendationData = req.body;

        if (Object.keys(recommendationData).length === 0) {
            return res.status(400).json({ error: 'No update data provided.' });
        }

        const updatedRecommendation = await recommendationService.updateRecommendation(
            id,
            userId,
            recommendationData
        );
        res.json(updatedRecommendation);
    } catch (error) {
        console.error('Error updating recommendation:', error);
        if (error.message === 'Recommendation not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'User not authorized to update this recommendation') {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update recommendation' });
    }
});

/**
 * GET /api/teacher-tools/recommendations/subjects/{subject}
 * Get recommendations filtered by subject
 */
router.get('/subjects/:subject', authenticateToken, async (req, res) => {
    try {
        const { subject } = req.params;
        const recommendations = await recommendationService.getRecommendationsBySubject(subject);
        res.json(recommendations);
    } catch (error) {
        console.error('Error getting subject recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch subject recommendations' });
    }
});

/**
 * DELETE /api/teacher-tools/recommendations/:id
 * Delete a recommendation
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id; // From authenticateToken

        const result = await recommendationService.deleteRecommendation(id, userId);
        res.json(result);
    } catch (error) {
        console.error('Error deleting recommendation:', error);
        if (error.message === 'Recommendation not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'User not authorized to delete this recommendation') {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to delete recommendation' });
    }
});

module.exports = router;