// services/learning-path-service/routes/skills.js
const express = require('express');
const db = require('../db');
const router = express.Router();
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');
const authorizeRole = require('../middleware/authorizeRole');

// --- Get Skills for a Learning Path ---
// GET /api/learning-paths/skills?learning_path_id=X
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    const { learning_path_id } = req.query;
    
    if (!learning_path_id) {
        return res.status(400).json({ error: 'Missing required query parameter: learning_path_id' });
    }
    
    console.log(`[LearningPathService] Received request to get skills for learning path ${learning_path_id} for user ${userId}`);
    
    try {
        // Get skills for this learning path
        const skillsQuery = `
            SELECT s.id, s.learning_path_id, s.title, s.description, s.skill_type, 
                   s.difficulty, s.points, s.prerequisites, s.order_index, s.estimated_minutes,
                   COALESCE(us.status, 'not_started') as status,
                   COALESCE(us.progress_percentage, 0) as progress_percentage,
                   us.started_at, us.completed_at, us.last_activity_at, 
                   COALESCE(us.points_earned, 0) as points_earned
            FROM skills s
            LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = $1
            WHERE s.learning_path_id = $2 AND s.is_active = TRUE
            ORDER BY s.order_index ASC
        `;
        
        const { rows: skillRows } = await db.query(skillsQuery, [userId, learning_path_id]);
        
        // Get resources for each skill
        const skillIds = skillRows.map(skill => skill.id);
        
        let resources = [];
        if (skillIds.length > 0) {
            const resourcesQuery = `
                SELECT sr.id, sr.skill_id, sr.resource_type, sr.title, sr.description,
                       sr.content_url, sr.book_id, sr.chapter_index, sr.quiz_id
                FROM skill_resources sr
                WHERE sr.skill_id = ANY($1)
            `;
            
            const { rows: resourceRows } = await db.query(resourcesQuery, [skillIds]);
            resources = resourceRows;
        }
        
        // Group resources by skill_id
        const resourcesBySkill = {};
        resources.forEach(resource => {
            if (!resourcesBySkill[resource.skill_id]) {
                resourcesBySkill[resource.skill_id] = [];
            }
            resourcesBySkill[resource.skill_id].push(resource);
        });
        
        // Add resources to each skill
        skillRows.forEach(skill => {
            skill.resources = resourcesBySkill[skill.id] || [];
        });
        
        console.log(`[LearningPathService] Retrieved ${skillRows.length} skills for learning path ${learning_path_id}`);
        res.status(200).json(skillRows);
    } catch (error) {
        console.error(`[LearningPathService] Error getting skills for learning path ${learning_path_id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve skills' });
    }
});

// --- Get Skill by ID ---
// GET /api/learning-paths/skills/:id
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const skillId = req.params.id;
    
    console.log(`[LearningPathService] Received request to get skill ${skillId} for user ${userId}`);
    
    try {
        // Get skill details
        const skillQuery = `
            SELECT s.id, s.learning_path_id, s.title, s.description, s.skill_type, 
                   s.difficulty, s.points, s.prerequisites, s.order_index, s.estimated_minutes,
                   COALESCE(us.status, 'not_started') as status,
                   COALESCE(us.progress_percentage, 0) as progress_percentage,
                   us.started_at, us.completed_at, us.last_activity_at, 
                   COALESCE(us.points_earned, 0) as points_earned
            FROM skills s
            LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = $1
            WHERE s.id = $2 AND s.is_active = TRUE
        `;
        
        const { rows: skillRows } = await db.query(skillQuery, [userId, skillId]);
        
        if (skillRows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        
        const skill = skillRows[0];
        
        // Get resources for this skill
        const resourcesQuery = `
            SELECT sr.id, sr.skill_id, sr.resource_type, sr.title, sr.description,
                   sr.content_url, sr.book_id, sr.chapter_index, sr.quiz_id
            FROM skill_resources sr
            WHERE sr.skill_id = $1
        `;
        
        const { rows: resourceRows } = await db.query(resourcesQuery, [skillId]);
        
        // Add resources to skill
        skill.resources = resourceRows;
        
        // Get learning path info
        const pathQuery = `
            SELECT lp.id, lp.title, lp.subject, lp.grade_level, lp.difficulty
            FROM learning_paths lp
            WHERE lp.id = $1 AND lp.is_active = TRUE
        `;
        
        const { rows: pathRows } = await db.query(pathQuery, [skill.learning_path_id]);
        
        if (pathRows.length > 0) {
            skill.learning_path = pathRows[0];
        }
        
        console.log(`[LearningPathService] Retrieved skill ${skillId} for user ${userId}`);
        res.status(200).json(skill);
    } catch (error) {
        console.error(`[LearningPathService] Error getting skill ${skillId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve skill' });
    }
});

// --- Start Skill ---
// POST /api/learning-paths/skills/:id/start
router.post('/:id/start', async (req, res) => {
    const userId = req.user.userId;
    const skillId = req.params.id;
    
    console.log(`[LearningPathService] Received request to start skill ${skillId} for user ${userId}`);
    
    try {
        // Check if skill exists
        const checkQuery = `
            SELECT id, learning_path_id FROM skills WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [skillId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        
        const learningPathId = checkRows[0].learning_path_id;
        
        // Start or update skill progress
        const upsertQuery = `
            INSERT INTO user_skills 
            (user_id, skill_id, status, progress_percentage, started_at, last_activity_at)
            VALUES ($1, $2, 'in_progress', 0, NOW(), NOW())
            ON CONFLICT (user_id, skill_id)
            DO UPDATE SET 
                status = CASE WHEN user_skills.status = 'completed' OR user_skills.status = 'mastered'
                              THEN user_skills.status 
                              ELSE 'in_progress' END,
                started_at = COALESCE(user_skills.started_at, NOW()),
                last_activity_at = NOW(),
                updated_at = NOW()
            RETURNING id, status, progress_percentage, started_at, completed_at, last_activity_at, points_earned
        `;
        
        const { rows: upsertRows } = await db.query(upsertQuery, [userId, skillId]);
        
        // Also ensure the learning path is started
        const pathUpsertQuery = `
            INSERT INTO user_learning_paths 
            (user_id, learning_path_id, status, progress_percentage, started_at, last_activity_at)
            VALUES ($1, $2, 'in_progress', 0, NOW(), NOW())
            ON CONFLICT (user_id, learning_path_id)
            DO UPDATE SET 
                status = CASE WHEN user_learning_paths.status = 'completed' 
                              THEN 'completed' 
                              ELSE 'in_progress' END,
                started_at = COALESCE(user_learning_paths.started_at, NOW()),
                last_activity_at = NOW(),
                updated_at = NOW()
            RETURNING id
        `;
        
        await db.query(pathUpsertQuery, [userId, learningPathId]);
        
        console.log(`[LearningPathService] Started/updated skill ${skillId} for user ${userId}`);
        res.status(200).json(upsertRows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error starting skill ${skillId}:`, error);
        res.status(500).json({ error: 'Failed to start skill' });
    }
});

// --- Complete Skill ---
// POST /api/learning-paths/skills/:id/complete
router.post('/:id/complete', checkUsageLimit(usageLimitService.SERVICES.COMPLETE_SKILL), async (req, res) => {
    const userId = req.user.userId;
    const skillId = req.params.id;
    
    console.log(`[LearningPathService] Received request to complete skill ${skillId} for user ${userId}`);
    
    try {
        // Check if skill exists and get its details
        const checkQuery = `
            SELECT id, learning_path_id, points FROM skills WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [skillId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        
        const learningPathId = checkRows[0].learning_path_id;
        const skillPoints = checkRows[0].points || 10; // Default to 10 points if not specified
        
        // Complete the skill
        const updateQuery = `
            INSERT INTO user_skills 
            (user_id, skill_id, status, progress_percentage, started_at, completed_at, last_activity_at, points_earned)
            VALUES ($1, $2, 'completed', 100, NOW(), NOW(), NOW(), $3)
            ON CONFLICT (user_id, skill_id)
            DO UPDATE SET 
                status = 'completed',
                progress_percentage = 100,
                started_at = COALESCE(user_skills.started_at, NOW()),
                completed_at = NOW(),
                last_activity_at = NOW(),
                points_earned = $3,
                updated_at = NOW()
            RETURNING id, status, progress_percentage, started_at, completed_at, last_activity_at, points_earned
        `;
        
        const { rows: updateRows } = await db.query(updateQuery, [userId, skillId, skillPoints]);
        
        // Update learning path progress
        // First, get total skills and completed skills for this learning path
        const progressQuery = `
            SELECT 
                (SELECT COUNT(*) FROM skills WHERE learning_path_id = $1 AND is_active = TRUE) as total_skills,
                (SELECT COUNT(*) FROM user_skills us 
                 JOIN skills s ON us.skill_id = s.id 
                 WHERE s.learning_path_id = $1 AND us.user_id = $2 AND us.status = 'completed') as completed_skills
        `;
        
        const { rows: progressRows } = await db.query(progressQuery, [learningPathId, userId]);
        
        if (progressRows.length > 0) {
            const totalSkills = parseInt(progressRows[0].total_skills) || 1; // Avoid division by zero
            const completedSkills = parseInt(progressRows[0].completed_skills) || 0;
            const progressPercentage = Math.round((completedSkills / totalSkills) * 100);
            
            // Determine if learning path is completed
            let status = 'in_progress';
            let completedAt = null;
            
            if (progressPercentage >= 100) {
                status = 'completed';
                completedAt = 'NOW()';
            }
            
            // Update learning path progress
            const pathUpdateQuery = `
                UPDATE user_learning_paths
                SET status = $3,
                    progress_percentage = $4,
                    completed_at = ${completedAt ? completedAt : 'completed_at'},
                    last_activity_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1 AND learning_path_id = $2
                RETURNING id, status, progress_percentage
            `;
            
            await db.query(pathUpdateQuery, [userId, learningPathId, status, progressPercentage]);
        }
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.COMPLETE_SKILL);
        }
        
        console.log(`[LearningPathService] Completed skill ${skillId} for user ${userId}`);
        res.status(200).json(updateRows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error completing skill ${skillId}:`, error);
        res.status(500).json({ error: 'Failed to complete skill' });
    }
});

// --- Update Skill Progress ---
// PUT /api/learning-paths/skills/:id/progress
router.put('/:id/progress', checkUsageLimit(usageLimitService.SERVICES.TRACK_PROGRESS), async (req, res) => {
    const userId = req.user.userId;
    const skillId = req.params.id;
    const { progress_percentage } = req.body;
    
    console.log(`[LearningPathService] Received request to update progress for skill ${skillId} for user ${userId}`);
    
    // Validate progress percentage
    if (progress_percentage === undefined || progress_percentage < 0 || progress_percentage > 100) {
        return res.status(400).json({ error: 'Invalid progress percentage. Must be between 0 and 100.' });
    }
    
    try {
        // Check if skill exists and get its details
        const checkQuery = `
            SELECT id, learning_path_id, points FROM skills WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [skillId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        
        const learningPathId = checkRows[0].learning_path_id;
        const skillPoints = checkRows[0].points || 10; // Default to 10 points if not specified
        
        // Determine status and points based on progress
        let status = 'in_progress';
        let completedAt = null;
        let pointsEarned = 0;
        
        if (progress_percentage >= 100) {
            status = 'completed';
            completedAt = 'NOW()';
            pointsEarned = skillPoints;
        } else if (progress_percentage > 0) {
            // Partial points based on progress
            pointsEarned = Math.floor((progress_percentage / 100) * skillPoints);
        }
        
        // Update skill progress
        const updateQuery = `
            INSERT INTO user_skills 
            (user_id, skill_id, status, progress_percentage, started_at, completed_at, last_activity_at, points_earned)
            VALUES ($1, $2, $3, $4, NOW(), ${completedAt ? completedAt : 'NULL'}, NOW(), $5)
            ON CONFLICT (user_id, skill_id)
            DO UPDATE SET 
                status = CASE 
                          WHEN user_skills.status = 'mastered' THEN 'mastered'
                          WHEN $3 = 'completed' AND user_skills.status != 'completed' THEN 'completed'
                          WHEN user_skills.status = 'completed' THEN 'completed'
                          ELSE $3
                         END,
                progress_percentage = $4,
                started_at = COALESCE(user_skills.started_at, NOW()),
                completed_at = CASE 
                                WHEN $3 = 'completed' AND user_skills.completed_at IS NULL THEN NOW()
                                ELSE user_skills.completed_at
                               END,
                last_activity_at = NOW(),
                points_earned = $5,
                updated_at = NOW()
            RETURNING id, status, progress_percentage, started_at, completed_at, last_activity_at, points_earned
        `;
        
        const { rows: updateRows } = await db.query(updateQuery, [userId, skillId, status, progress_percentage, pointsEarned]);
        
        // Update learning path progress
        // First, get total skills and completed skills for this learning path
        const progressQuery = `
            SELECT 
                (SELECT COUNT(*) FROM skills WHERE learning_path_id = $1 AND is_active = TRUE) as total_skills,
                (SELECT COUNT(*) FROM user_skills us 
                 JOIN skills s ON us.skill_id = s.id 
                 WHERE s.learning_path_id = $1 AND us.user_id = $2 AND us.status = 'completed') as completed_skills,
                (SELECT SUM(us.progress_percentage) FROM user_skills us 
                 JOIN skills s ON us.skill_id = s.id 
                 WHERE s.learning_path_id = $1 AND us.user_id = $2) as total_progress
        `;
        
        const { rows: progressRows } = await db.query(progressQuery, [learningPathId, userId]);
        
        if (progressRows.length > 0) {
            const totalSkills = parseInt(progressRows[0].total_skills) || 1; // Avoid division by zero
            const completedSkills = parseInt(progressRows[0].completed_skills) || 0;
            const totalProgress = parseInt(progressRows[0].total_progress) || 0;
            
            // Calculate overall progress percentage
            // Method 1: Based on completed skills
            const completedPercentage = Math.round((completedSkills / totalSkills) * 100);
            
            // Method 2: Based on average progress across all skills
            const averagePercentage = Math.round(totalProgress / totalSkills);
            
            // Use the higher of the two methods
            const progressPercentage = Math.max(completedPercentage, averagePercentage);
            
            // Determine if learning path is completed
            let pathStatus = 'in_progress';
            let pathCompletedAt = null;
            
            if (progressPercentage >= 100) {
                pathStatus = 'completed';
                pathCompletedAt = 'NOW()';
            }
            
            // Update learning path progress
            const pathUpdateQuery = `
                INSERT INTO user_learning_paths 
                (user_id, learning_path_id, status, progress_percentage, started_at, completed_at, last_activity_at)
                VALUES ($1, $2, $3, $4, NOW(), ${pathCompletedAt ? pathCompletedAt : 'NULL'}, NOW())
                ON CONFLICT (user_id, learning_path_id)
                DO UPDATE SET 
                    status = $3,
                    progress_percentage = $4,
                    started_at = COALESCE(user_learning_paths.started_at, NOW()),
                    completed_at = ${pathCompletedAt ? pathCompletedAt : 'user_learning_paths.completed_at'},
                    last_activity_at = NOW(),
                    updated_at = NOW()
                RETURNING id, status, progress_percentage
            `;
            
            await db.query(pathUpdateQuery, [userId, learningPathId, pathStatus, progressPercentage]);
        }
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.TRACK_PROGRESS);
        }
        
        console.log(`[LearningPathService] Updated progress for skill ${skillId} for user ${userId} to ${progress_percentage}%`);
        res.status(200).json(updateRows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error updating progress for skill ${skillId}:`, error);
        res.status(500).json({ error: 'Failed to update skill progress' });
    }
});

// --- Create Skill (Admin Only) ---
// POST /api/learning-paths/skills
router.post('/', authorizeRole(['admin']), async (req, res) => {
    const { 
        learning_path_id, title, description, skill_type, difficulty, 
        points, prerequisites, order_index, estimated_minutes 
    } = req.body;
    
    // Validate required fields
    if (!learning_path_id || !title || !skill_type) {
        return res.status(400).json({ error: 'Missing required fields: learning_path_id, title, skill_type' });
    }
    
    console.log(`[LearningPathService] Received request to create skill: ${title}`);
    
    try {
        // Check if learning path exists
        const checkQuery = `SELECT id FROM learning_paths WHERE id = $1`;
        const { rows: checkRows } = await db.query(checkQuery, [learning_path_id]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        // Get max order_index if not provided
        let finalOrderIndex = order_index;
        if (finalOrderIndex === undefined) {
            const maxOrderQuery = `
                SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
                FROM skills
                WHERE learning_path_id = $1
            `;
            const { rows: maxOrderRows } = await db.query(maxOrderQuery, [learning_path_id]);
            finalOrderIndex = maxOrderRows[0].next_order;
        }
        
        const insertQuery = `
            INSERT INTO skills 
            (learning_path_id, title, description, skill_type, difficulty, 
             points, prerequisites, order_index, estimated_minutes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const { rows } = await db.query(insertQuery, [
            learning_path_id,
            title,
            description || null,
            skill_type,
            difficulty || 1,
            points || 10,
            prerequisites || '{}',
            finalOrderIndex,
            estimated_minutes || null
        ]);
        
        console.log(`[LearningPathService] Created skill with ID ${rows[0].id}`);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error creating skill:`, error);
        res.status(500).json({ error: 'Failed to create skill' });
    }
});

// --- Add Resource to Skill (Admin Only) ---
// POST /api/learning-paths/skills/:id/resources
router.post('/:id/resources', authorizeRole(['admin']), async (req, res) => {
    const skillId = req.params.id;
    const { 
        resource_type, title, description, content_url, 
        book_id, chapter_index, quiz_id 
    } = req.body;
    
    // Validate required fields
    if (!resource_type || !title) {
        return res.status(400).json({ error: 'Missing required fields: resource_type, title' });
    }
    
    console.log(`[LearningPathService] Received request to add resource to skill ${skillId}`);
    
    try {
        // Check if skill exists
        const checkQuery = `SELECT id FROM skills WHERE id = $1`;
        const { rows: checkRows } = await db.query(checkQuery, [skillId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        
        const insertQuery = `
            INSERT INTO skill_resources 
            (skill_id, resource_type, title, description, content_url, 
             book_id, chapter_index, quiz_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const { rows } = await db.query(insertQuery, [
            skillId,
            resource_type,
            title,
            description || null,
            content_url || null,
            book_id || null,
            chapter_index || null,
            quiz_id || null
        ]);
        
        console.log(`[LearningPathService] Added resource with ID ${rows[0].id} to skill ${skillId}`);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error adding resource to skill ${skillId}:`, error);
        res.status(500).json({ error: 'Failed to add resource to skill' });
    }
});

module.exports = router;
