// services/learning-path-service/routes/achievements.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRole = require('../middleware/authorizeRole');
const checkUsageLimit = require('../middleware/checkUsageLimit');
const usageLimitService = require('../services/usageLimitService');
const axios = require('axios'); // Import axios

// --- Get All Achievements ---
// GET /api/learning-paths/achievements
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get achievements for user ${userId}`);
    
    try {
        // Get all achievements with user unlock status
        const query = `
            SELECT a.id, a.title, a.description, a.achievement_type, a.icon_name, 
                   a.points, a.difficulty, a.requirements, a.is_active,
                   ua.id IS NOT NULL as is_unlocked,
                   ua.unlocked_at,
                   COALESCE(ua.points_earned, 0) as points_earned
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
            WHERE a.is_active = TRUE
            ORDER BY a.achievement_type, a.difficulty, a.title
        `;
        
        const { rows } = await db.query(query, [userId]);
        
        console.log(`[LearningPathService] Retrieved ${rows.length} achievements for user ${userId}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[LearningPathService] Error getting achievements:`, error);
        res.status(500).json({ error: 'Failed to retrieve achievements' });
    }
});

// --- Get Achievement by ID ---
// GET /api/learning-paths/achievements/:id
router.get('/:id', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const achievementId = req.params.id;
    
    console.log(`[LearningPathService] Received request to get achievement ${achievementId} for user ${userId}`);
    
    try {
        // Get achievement details with user unlock status
        const query = `
            SELECT a.id, a.title, a.description, a.achievement_type, a.icon_name, 
                   a.points, a.difficulty, a.requirements, a.is_active,
                   ua.id IS NOT NULL as is_unlocked,
                   ua.unlocked_at,
                   COALESCE(ua.points_earned, 0) as points_earned
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
            WHERE a.id = $2 AND a.is_active = TRUE
        `;
        
        const { rows } = await db.query(query, [userId, achievementId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Achievement not found' });
        }
        
        console.log(`[LearningPathService] Retrieved achievement ${achievementId} for user ${userId}`);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error getting achievement ${achievementId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve achievement' });
    }
});

// --- Unlock Achievement ---
// POST /api/learning-paths/achievements/:id/unlock
router.post('/:id/unlock', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.UNLOCK_ACHIEVEMENT), async (req, res) => {
    const userId = req.user.userId;
    const achievementId = req.params.id;
    const userFirstName = req.user.firstName || 'User'; // Get first name from token if available

    console.log(`[LearningPathService] Received request to unlock achievement ${achievementId} for user ${userId}`);

    try {
        // Check if achievement exists and get its details
        const checkQuery = `
            SELECT id, title, points FROM achievements WHERE id = $1 AND is_active = TRUE
        `;
        const { rows: checkRows } = await db.query(checkQuery, [achievementId]);

        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Achievement not found or not active' });
        }
        const achievementTitle = checkRows[0].title;
        const achievementPoints = checkRows[0].points || 50; // Default to 50 points if not specified

        // Check if already unlocked
        const checkUnlockedQuery = `
            SELECT id FROM user_achievements WHERE user_id = $1 AND achievement_id = $2
        `;
        const { rows: checkUnlockedRows } = await db.query(checkUnlockedQuery, [userId, achievementId]);

        if (checkUnlockedRows.length > 0) {
            return res.status(200).json({
                message: 'Achievement already unlocked',
                achievement_id: achievementId,
            });
        }

        // Unlock the achievement
        const unlockQuery = `
            INSERT INTO user_achievements
            (user_id, achievement_id, unlocked_at, points_earned)
            VALUES ($1, $2, NOW(), $3)
            RETURNING id, achievement_id, unlocked_at, points_earned
        `;
        const { rows: unlockRows } = await db.query(unlockQuery, [userId, achievementId, achievementPoints]);

        // Record usage *after* successful unlock
        await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.UNLOCK_ACHIEVEMENT);

        console.log(`[LearningPathService] Unlocked achievement ${achievementId} (${achievementTitle}) for user ${userId}`);

        // --- Send Notification --- 
        try {
            const notificationData = {
                type: 'achievement_unlocked',
                title: 'Achievement Unlocked!',
                message: `Congratulations ${userFirstName}, you unlocked the "${achievementTitle}" achievement and earned ${achievementPoints} points!`,
                achievementId: achievementId,
                achievementTitle: achievementTitle,
                pointsEarned: achievementPoints
            };
            const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008'; // Get from env or default
            const internalApiKey = process.env.INTERNAL_SERVICE_API_KEY;

            if (notificationServiceUrl && internalApiKey) {
                await axios.post(`${notificationServiceUrl}/api/notifications/internal/send`, {
                    userId: userId,
                    notificationData: notificationData
                }, {
                    headers: {
                        'x-internal-api-key': internalApiKey
                    }
                });
                console.log(`[LearningPathService] Sent unlock notification for achievement ${achievementId} to user ${userId}`);
            } else {
                 console.warn(`[LearningPathService] Notification service URL or internal API key not configured. Skipping notification for achievement ${achievementId}.`);
            }
        } catch (notificationError) {
            console.error(`[LearningPathService] Failed to send notification for achievement ${achievementId} unlock for user ${userId}:`, notificationError.message);
            // Do not fail the main request if notification fails
        }
        // --- End Send Notification ---

        res.status(201).json({
            message: 'Achievement unlocked successfully',
            data: unlockRows[0],
        });

    } catch (error) {
        console.error(`[LearningPathService] Error unlocking achievement ${achievementId}:`, error);
        res.status(500).json({ error: 'Failed to unlock achievement' });
    }
});

// --- Check Achievement Progress ---
// GET /api/learning-paths/achievements/:id/progress
router.get('/:id/progress', async (req, res) => {
    const userId = req.user.userId;
    const achievementId = req.params.id;
    
    console.log(`[LearningPathService] Received request to check progress for achievement ${achievementId} for user ${userId}`);
    
    try {
        // Get achievement details
        const achievementQuery = `
            SELECT id, title, achievement_type, requirements
            FROM achievements
            WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: achievementRows } = await db.query(achievementQuery, [achievementId]);
        
        if (achievementRows.length === 0) {
            return res.status(404).json({ error: 'Achievement not found' });
        }
        
        const achievement = achievementRows[0];
        const requirements = achievement.requirements;
        
        // Check if already unlocked
        const checkUnlockedQuery = `
            SELECT id FROM user_achievements WHERE user_id = $1 AND achievement_id = $2
        `;
        
        const { rows: checkUnlockedRows } = await db.query(checkUnlockedQuery, [userId, achievementId]);
        
        if (checkUnlockedRows.length > 0) {
            return res.status(200).json({ 
                achievement_id: achievementId,
                title: achievement.title,
                unlocked: true,
                progress: 100,
                requirements,
                current_progress: requirements
            });
        }
        
        // Calculate progress based on achievement type
        let progress = 0;
        let currentProgress = {};
        
        switch (achievement.achievement_type) {
            case 'learning_path_completion':
                // Check learning path completion
                if (requirements.learning_path_id) {
                    const pathQuery = `
                        SELECT progress_percentage
                        FROM user_learning_paths
                        WHERE user_id = $1 AND learning_path_id = $2
                    `;
                    
                    const { rows: pathRows } = await db.query(pathQuery, [userId, requirements.learning_path_id]);
                    
                    if (pathRows.length > 0) {
                        progress = pathRows[0].progress_percentage;
                        currentProgress = { 
                            learning_path_id: requirements.learning_path_id,
                            progress_percentage: progress
                        };
                    }
                }
                break;
                
            case 'skill_mastery':
                // Check skill mastery
                if (requirements.skill_count) {
                    const skillQuery = `
                        SELECT COUNT(*) as mastered_count
                        FROM user_skills
                        WHERE user_id = $1 AND status = 'mastered'
                    `;
                    
                    const { rows: skillRows } = await db.query(skillQuery, [userId]);
                    
                    if (skillRows.length > 0) {
                        const masteredCount = parseInt(skillRows[0].mastered_count) || 0;
                        const requiredCount = parseInt(requirements.skill_count) || 1;
                        progress = Math.min(100, Math.round((masteredCount / requiredCount) * 100));
                        currentProgress = { 
                            skill_count: requirements.skill_count,
                            mastered_count: masteredCount
                        };
                    }
                }
                break;
                
            case 'subject_completion':
                // Check subject completion
                if (requirements.subject) {
                    const subjectQuery = `
                        SELECT AVG(ulp.progress_percentage) as avg_progress
                        FROM user_learning_paths ulp
                        JOIN learning_paths lp ON ulp.learning_path_id = lp.id
                        WHERE ulp.user_id = $1 AND lp.subject = $2
                    `;
                    
                    const { rows: subjectRows } = await db.query(subjectQuery, [userId, requirements.subject]);
                    
                    if (subjectRows.length > 0 && subjectRows[0].avg_progress !== null) {
                        progress = Math.round(subjectRows[0].avg_progress);
                        currentProgress = { 
                            subject: requirements.subject,
                            avg_progress: progress
                        };
                    }
                }
                break;
                
            case 'points_earned':
                // Check points earned
                if (requirements.points_required) {
                    const pointsQuery = `
                        SELECT COALESCE(SUM(points_earned), 0) as total_points
                        FROM user_skills
                        WHERE user_id = $1
                    `;
                    
                    const { rows: pointsRows } = await db.query(pointsQuery, [userId]);
                    
                    if (pointsRows.length > 0) {
                        const totalPoints = parseInt(pointsRows[0].total_points) || 0;
                        const requiredPoints = parseInt(requirements.points_required) || 1;
                        progress = Math.min(100, Math.round((totalPoints / requiredPoints) * 100));
                        currentProgress = { 
                            points_required: requirements.points_required,
                            total_points: totalPoints
                        };
                    }
                }
                break;
                
            default:
                // Unknown achievement type
                progress = 0;
                currentProgress = {};
        }
        
        console.log(`[LearningPathService] Checked progress for achievement ${achievementId} for user ${userId}: ${progress}%`);
        res.status(200).json({
            achievement_id: achievementId,
            title: achievement.title,
            unlocked: false,
            progress,
            requirements,
            current_progress: currentProgress
        });
    } catch (error) {
        console.error(`[LearningPathService] Error checking progress for achievement ${achievementId}:`, error);
        res.status(500).json({ error: 'Failed to check achievement progress' });
    }
});

// --- Create Achievement (Admin Only) ---
// POST /api/learning-paths/achievements
router.post('/', authorizeRole(['admin']), async (req, res) => {
    const { 
        title, description, achievement_type, icon_name, 
        points, difficulty, requirements 
    } = req.body;
    
    // Validate required fields
    if (!title || !achievement_type || !requirements) {
        return res.status(400).json({ error: 'Missing required fields: title, achievement_type, requirements' });
    }
    
    console.log(`[LearningPathService] Received request to create achievement: ${title}`);
    
    try {
        const insertQuery = `
            INSERT INTO achievements 
            (title, description, achievement_type, icon_name, points, difficulty, requirements)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const { rows } = await db.query(insertQuery, [
            title,
            description || null,
            achievement_type,
            icon_name || null,
            points || 50,
            difficulty || 'medium',
            requirements
        ]);
        
        console.log(`[LearningPathService] Created achievement with ID ${rows[0].id}`);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error creating achievement:`, error);
        res.status(500).json({ error: 'Failed to create achievement' });
    }
});

module.exports = router;
