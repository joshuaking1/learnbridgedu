// services/learning-path-service/routes/recommendations.js
const express = require('express');
const db = require('../db');
const router = express.Router();
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');

// --- Get Personalized Recommendations ---
// GET /api/learning-paths/recommendations
router.get('/', checkUsageLimit(usageLimitService.SERVICES.GENERATE_RECOMMENDATIONS), async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get recommendations for user ${userId}`);
    
    try {
        // Get existing recommendations
        const existingQuery = `
            SELECT id, recommendation_type, title, description, resource_type, resource_id, priority, is_dismissed
            FROM user_recommendations
            WHERE user_id = $1 AND is_dismissed = FALSE
            ORDER BY priority DESC, created_at DESC
        `;
        
        const { rows: existingRows } = await db.query(existingQuery, [userId]);
        
        // If we have existing recommendations, return them
        if (existingRows.length > 0) {
            console.log(`[LearningPathService] Found ${existingRows.length} existing recommendations for user ${userId}`);
            return res.status(200).json(existingRows);
        }
        
        // Generate new recommendations
        console.log(`[LearningPathService] Generating new recommendations for user ${userId}`);
        
        // 1. Get in-progress learning paths
        const inProgressPathsQuery = `
            SELECT ulp.learning_path_id, lp.title, lp.subject, ulp.progress_percentage
            FROM user_learning_paths ulp
            JOIN learning_paths lp ON ulp.learning_path_id = lp.id
            WHERE ulp.user_id = $1 AND ulp.status = 'in_progress'
            ORDER BY ulp.last_activity_at DESC
        `;
        
        const { rows: inProgressPaths } = await db.query(inProgressPathsQuery, [userId]);
        
        // 2. Get next skills to complete in in-progress paths
        const nextSkillsQuery = `
            SELECT s.id, s.title, s.learning_path_id, lp.title as learning_path_title, lp.subject
            FROM skills s
            JOIN learning_paths lp ON s.learning_path_id = lp.id
            LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = $1
            WHERE s.learning_path_id = ANY($2)
              AND s.is_active = TRUE
              AND (us.id IS NULL OR us.status = 'not_started')
            ORDER BY s.learning_path_id, s.order_index
            LIMIT 5
        `;
        
        const pathIds = inProgressPaths.map(path => path.learning_path_id);
        const { rows: nextSkills } = await db.query(nextSkillsQuery, [userId, pathIds]);
        
        // 3. Get recommended learning paths based on user's interests (subjects they've started)
        const recommendedPathsQuery = `
            SELECT lp.id, lp.title, lp.subject, lp.difficulty
            FROM learning_paths lp
            WHERE lp.is_active = TRUE
              AND lp.subject IN (
                SELECT DISTINCT lp2.subject
                FROM user_learning_paths ulp
                JOIN learning_paths lp2 ON ulp.learning_path_id = lp2.id
                WHERE ulp.user_id = $1
              )
              AND lp.id NOT IN (
                SELECT learning_path_id
                FROM user_learning_paths
                WHERE user_id = $1
              )
            ORDER BY lp.created_at DESC
            LIMIT 3
        `;
        
        const { rows: recommendedPaths } = await db.query(recommendedPathsQuery, [userId]);
        
        // 4. Get skills that need review (partially completed but not finished)
        const reviewSkillsQuery = `
            SELECT s.id, s.title, s.learning_path_id, lp.title as learning_path_title, lp.subject, us.progress_percentage
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.id
            JOIN learning_paths lp ON s.learning_path_id = lp.id
            WHERE us.user_id = $1
              AND us.status = 'in_progress'
              AND us.progress_percentage BETWEEN 10 AND 90
            ORDER BY us.last_activity_at DESC
            LIMIT 3
        `;
        
        const { rows: reviewSkills } = await db.query(reviewSkillsQuery, [userId]);
        
        // 5. Get achievements that are close to being unlocked
        const achievementsQuery = `
            SELECT a.id, a.title, a.achievement_type, a.requirements
            FROM achievements a
            WHERE a.is_active = TRUE
              AND a.id NOT IN (
                SELECT achievement_id
                FROM user_achievements
                WHERE user_id = $1
              )
            LIMIT 5
        `;
        
        const { rows: potentialAchievements } = await db.query(achievementsQuery, [userId]);
        
        // Create recommendations array
        const recommendations = [];
        
        // Add next skills recommendations
        nextSkills.forEach((skill, index) => {
            recommendations.push({
                recommendation_type: 'next_skill',
                title: `Continue with "${skill.title}"`,
                description: `Continue your progress in ${skill.learning_path_title}`,
                resource_type: 'skill',
                resource_id: skill.id,
                priority: 5 - index // Higher priority for first skills
            });
        });
        
        // Add recommended paths
        recommendedPaths.forEach((path, index) => {
            recommendations.push({
                recommendation_type: 'new_path',
                title: `Start learning "${path.title}"`,
                description: `Expand your knowledge in ${path.subject}`,
                resource_type: 'learning_path',
                resource_id: path.id,
                priority: 3 - index
            });
        });
        
        // Add review skills
        reviewSkills.forEach((skill, index) => {
            recommendations.push({
                recommendation_type: 'review_skill',
                title: `Complete "${skill.title}"`,
                description: `You're ${skill.progress_percentage}% through this skill`,
                resource_type: 'skill',
                resource_id: skill.id,
                priority: 4 - index
            });
        });
        
        // Save recommendations to database
        if (recommendations.length > 0) {
            // First, clear old recommendations
            await db.query(
                'DELETE FROM user_recommendations WHERE user_id = $1',
                [userId]
            );
            
            // Insert new recommendations
            const insertPromises = recommendations.map(rec => {
                const insertQuery = `
                    INSERT INTO user_recommendations
                    (user_id, recommendation_type, title, description, resource_type, resource_id, priority)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id
                `;
                
                return db.query(insertQuery, [
                    userId,
                    rec.recommendation_type,
                    rec.title,
                    rec.description,
                    rec.resource_type,
                    rec.resource_id,
                    rec.priority
                ]);
            });
            
            await Promise.all(insertPromises);
        }
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_RECOMMENDATIONS);
        }
        
        console.log(`[LearningPathService] Generated ${recommendations.length} recommendations for user ${userId}`);
        res.status(200).json(recommendations);
    } catch (error) {
        console.error(`[LearningPathService] Error generating recommendations:`, error);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

// --- Dismiss Recommendation ---
// POST /api/learning-paths/recommendations/:id/dismiss
router.post('/:id/dismiss', async (req, res) => {
    const userId = req.user.userId;
    const recommendationId = req.params.id;
    
    console.log(`[LearningPathService] Received request to dismiss recommendation ${recommendationId} for user ${userId}`);
    
    try {
        // Check if recommendation exists and belongs to user
        const checkQuery = `
            SELECT id FROM user_recommendations
            WHERE id = $1 AND user_id = $2
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [recommendationId, userId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }
        
        // Dismiss the recommendation
        const dismissQuery = `
            UPDATE user_recommendations
            SET is_dismissed = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING id, recommendation_type, title, is_dismissed
        `;
        
        const { rows } = await db.query(dismissQuery, [recommendationId]);
        
        console.log(`[LearningPathService] Dismissed recommendation ${recommendationId} for user ${userId}`);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error dismissing recommendation ${recommendationId}:`, error);
        res.status(500).json({ error: 'Failed to dismiss recommendation' });
    }
});

// --- Refresh Recommendations ---
// POST /api/learning-paths/recommendations/refresh
router.post('/refresh', checkUsageLimit(usageLimitService.SERVICES.GENERATE_RECOMMENDATIONS), async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to refresh recommendations for user ${userId}`);
    
    try {
        // Clear existing recommendations
        await db.query(
            'DELETE FROM user_recommendations WHERE user_id = $1',
            [userId]
        );
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_RECOMMENDATIONS);
        }
        
        console.log(`[LearningPathService] Refreshed recommendations for user ${userId}`);
        res.status(200).json({ message: 'Recommendations refreshed. Fetch new recommendations to see updates.' });
    } catch (error) {
        console.error(`[LearningPathService] Error refreshing recommendations:`, error);
        res.status(500).json({ error: 'Failed to refresh recommendations' });
    }
});

module.exports = router;
