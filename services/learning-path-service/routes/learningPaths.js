// services/learning-path-service/routes/learningPaths.js
const express = require('express');
const db = require('../db');
const router = express.Router();
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');
const authorizeRole = require('../middleware/authorizeRole');

// --- Get All Learning Paths ---
// GET /api/learning-paths
router.get('/', checkUsageLimit(usageLimitService.SERVICES.VIEW_LEARNING_PATH), async (req, res) => {
    const userId = req.user.userId;
    const { subject, grade, difficulty } = req.query;
    
    console.log(`[LearningPathService] Received request to get learning paths for user ${userId}`);
    
    try {
        // Build query with optional filters
        let query = `
            SELECT lp.id, lp.title, lp.description, lp.subject, lp.grade_level, 
                   lp.difficulty, lp.estimated_hours, lp.is_active,
                   COALESCE(ulp.status, 'not_started') as status,
                   COALESCE(ulp.progress_percentage, 0) as progress_percentage,
                   ulp.started_at, ulp.completed_at, ulp.last_activity_at,
                   (SELECT COUNT(*) FROM skills WHERE learning_path_id = lp.id) as total_skills,
                   (SELECT COUNT(*) FROM user_skills us 
                    JOIN skills s ON us.skill_id = s.id 
                    WHERE s.learning_path_id = lp.id AND us.user_id = $1 AND us.status = 'completed') as completed_skills
            FROM learning_paths lp
            LEFT JOIN user_learning_paths ulp ON lp.id = ulp.learning_path_id AND ulp.user_id = $1
            WHERE lp.is_active = TRUE
        `;
        
        const queryParams = [userId];
        let paramIndex = 2;
        
        // Add filters if provided
        if (subject) {
            query += ` AND lp.subject = $${paramIndex}`;
            queryParams.push(subject);
            paramIndex++;
        }
        
        if (grade) {
            query += ` AND lp.grade_level = $${paramIndex}`;
            queryParams.push(grade);
            paramIndex++;
        }
        
        if (difficulty) {
            query += ` AND lp.difficulty = $${paramIndex}`;
            queryParams.push(difficulty);
            paramIndex++;
        }
        
        // Order by progress and then by title
        query += ` ORDER BY CASE 
                    WHEN COALESCE(ulp.status, 'not_started') = 'in_progress' THEN 1
                    WHEN COALESCE(ulp.status, 'not_started') = 'not_started' THEN 2
                    WHEN COALESCE(ulp.status, 'not_started') = 'completed' THEN 3
                  END, lp.title ASC`;
        
        const { rows } = await db.query(query, queryParams);
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.VIEW_LEARNING_PATH);
        }
        
        console.log(`[LearningPathService] Found ${rows.length} learning paths for user ${userId}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[LearningPathService] Error getting learning paths:`, error);
        res.status(500).json({ error: 'Failed to retrieve learning paths' });
    }
});

// --- Get Learning Path by ID ---
// GET /api/learning-paths/:id
router.get('/:id', checkUsageLimit(usageLimitService.SERVICES.VIEW_LEARNING_PATH), async (req, res) => {
    const userId = req.user.userId;
    const pathId = req.params.id;
    
    console.log(`[LearningPathService] Received request to get learning path ${pathId} for user ${userId}`);
    
    try {
        // Get learning path details
        const pathQuery = `
            SELECT lp.id, lp.title, lp.description, lp.subject, lp.grade_level, 
                   lp.difficulty, lp.estimated_hours, lp.is_active,
                   COALESCE(ulp.status, 'not_started') as status,
                   COALESCE(ulp.progress_percentage, 0) as progress_percentage,
                   ulp.started_at, ulp.completed_at, ulp.last_activity_at,
                   (SELECT COUNT(*) FROM skills WHERE learning_path_id = lp.id) as total_skills,
                   (SELECT COUNT(*) FROM user_skills us 
                    JOIN skills s ON us.skill_id = s.id 
                    WHERE s.learning_path_id = lp.id AND us.user_id = $1 AND us.status = 'completed') as completed_skills
            FROM learning_paths lp
            LEFT JOIN user_learning_paths ulp ON lp.id = ulp.learning_path_id AND ulp.user_id = $1
            WHERE lp.id = $2 AND lp.is_active = TRUE
        `;
        
        const { rows: pathRows } = await db.query(pathQuery, [userId, pathId]);
        
        if (pathRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        const learningPath = pathRows[0];
        
        // Get skills for this learning path
        const skillsQuery = `
            SELECT s.id, s.title, s.description, s.skill_type, s.difficulty, 
                   s.points, s.prerequisites, s.order_index, s.estimated_minutes,
                   COALESCE(us.status, 'not_started') as status,
                   COALESCE(us.progress_percentage, 0) as progress_percentage,
                   us.started_at, us.completed_at, us.last_activity_at, 
                   COALESCE(us.points_earned, 0) as points_earned
            FROM skills s
            LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = $1
            WHERE s.learning_path_id = $2 AND s.is_active = TRUE
            ORDER BY s.order_index ASC
        `;
        
        const { rows: skillRows } = await db.query(skillsQuery, [userId, pathId]);
        
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
        
        // Add skills to learning path
        learningPath.skills = skillRows;
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.VIEW_LEARNING_PATH);
        }
        
        console.log(`[LearningPathService] Retrieved learning path ${pathId} with ${skillRows.length} skills for user ${userId}`);
        res.status(200).json(learningPath);
    } catch (error) {
        console.error(`[LearningPathService] Error getting learning path ${pathId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve learning path' });
    }
});

// --- Start Learning Path ---
// POST /api/learning-paths/:id/start
router.post('/:id/start', async (req, res) => {
    const userId = req.user.userId;
    const pathId = req.params.id;
    
    console.log(`[LearningPathService] Received request to start learning path ${pathId} for user ${userId}`);
    
    try {
        // Check if learning path exists
        const checkQuery = `
            SELECT id FROM learning_paths WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [pathId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        // Start or update learning path progress
        const upsertQuery = `
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
            RETURNING id, status, progress_percentage, started_at, completed_at, last_activity_at
        `;
        
        const { rows: upsertRows } = await db.query(upsertQuery, [userId, pathId]);
        
        console.log(`[LearningPathService] Started/updated learning path ${pathId} for user ${userId}`);
        res.status(200).json(upsertRows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error starting learning path ${pathId}:`, error);
        res.status(500).json({ error: 'Failed to start learning path' });
    }
});

// --- Update Learning Path Progress ---
// PUT /api/learning-paths/:id/progress
router.put('/:id/progress', checkUsageLimit(usageLimitService.SERVICES.TRACK_PROGRESS), async (req, res) => {
    const userId = req.user.userId;
    const pathId = req.params.id;
    const { progress_percentage } = req.body;
    
    console.log(`[LearningPathService] Received request to update progress for learning path ${pathId} for user ${userId}`);
    
    // Validate progress percentage
    if (progress_percentage === undefined || progress_percentage < 0 || progress_percentage > 100) {
        return res.status(400).json({ error: 'Invalid progress percentage. Must be between 0 and 100.' });
    }
    
    try {
        // Check if learning path exists
        const checkQuery = `
            SELECT id FROM learning_paths WHERE id = $1 AND is_active = TRUE
        `;
        
        const { rows: checkRows } = await db.query(checkQuery, [pathId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        // Determine status based on progress
        let status = 'in_progress';
        let completedAt = null;
        
        if (progress_percentage >= 100) {
            status = 'completed';
            completedAt = 'NOW()';
        }
        
        // Update learning path progress
        const updateQuery = `
            INSERT INTO user_learning_paths 
            (user_id, learning_path_id, status, progress_percentage, started_at, completed_at, last_activity_at)
            VALUES ($1, $2, $3, $4, NOW(), ${completedAt ? completedAt : 'NULL'}, NOW())
            ON CONFLICT (user_id, learning_path_id)
            DO UPDATE SET 
                status = $3,
                progress_percentage = $4,
                started_at = COALESCE(user_learning_paths.started_at, NOW()),
                completed_at = ${completedAt ? completedAt : 'user_learning_paths.completed_at'},
                last_activity_at = NOW(),
                updated_at = NOW()
            RETURNING id, status, progress_percentage, started_at, completed_at, last_activity_at
        `;
        
        const { rows: updateRows } = await db.query(updateQuery, [userId, pathId, status, progress_percentage]);
        
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.TRACK_PROGRESS);
        }
        
        console.log(`[LearningPathService] Updated progress for learning path ${pathId} for user ${userId} to ${progress_percentage}%`);
        res.status(200).json(updateRows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error updating progress for learning path ${pathId}:`, error);
        res.status(500).json({ error: 'Failed to update learning path progress' });
    }
});

// --- Create Learning Path (Admin Only) ---
// POST /api/learning-paths
router.post('/', authorizeRole(['admin']), async (req, res) => {
    const { title, description, subject, grade_level, difficulty, estimated_hours } = req.body;
    
    // Validate required fields
    if (!title || !subject || !grade_level) {
        return res.status(400).json({ error: 'Missing required fields: title, subject, grade_level' });
    }
    
    console.log(`[LearningPathService] Received request to create learning path: ${title}`);
    
    try {
        const insertQuery = `
            INSERT INTO learning_paths 
            (title, description, subject, grade_level, difficulty, estimated_hours)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const { rows } = await db.query(insertQuery, [
            title, 
            description || null, 
            subject, 
            grade_level, 
            difficulty || 'beginner', 
            estimated_hours || null
        ]);
        
        console.log(`[LearningPathService] Created learning path with ID ${rows[0].id}`);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error creating learning path:`, error);
        res.status(500).json({ error: 'Failed to create learning path' });
    }
});

// --- Update Learning Path (Admin Only) ---
// PUT /api/learning-paths/:id
router.put('/:id', authorizeRole(['admin']), async (req, res) => {
    const pathId = req.params.id;
    const { title, description, subject, grade_level, difficulty, estimated_hours, is_active } = req.body;
    
    console.log(`[LearningPathService] Received request to update learning path ${pathId}`);
    
    try {
        // Check if learning path exists
        const checkQuery = `SELECT id FROM learning_paths WHERE id = $1`;
        const { rows: checkRows } = await db.query(checkQuery, [pathId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        // Build update query dynamically based on provided fields
        let updateFields = [];
        let queryParams = [pathId]; // First parameter is always the path ID
        let paramIndex = 2;
        
        if (title !== undefined) {
            updateFields.push(`title = $${paramIndex++}`);
            queryParams.push(title);
        }
        
        if (description !== undefined) {
            updateFields.push(`description = $${paramIndex++}`);
            queryParams.push(description);
        }
        
        if (subject !== undefined) {
            updateFields.push(`subject = $${paramIndex++}`);
            queryParams.push(subject);
        }
        
        if (grade_level !== undefined) {
            updateFields.push(`grade_level = $${paramIndex++}`);
            queryParams.push(grade_level);
        }
        
        if (difficulty !== undefined) {
            updateFields.push(`difficulty = $${paramIndex++}`);
            queryParams.push(difficulty);
        }
        
        if (estimated_hours !== undefined) {
            updateFields.push(`estimated_hours = $${paramIndex++}`);
            queryParams.push(estimated_hours);
        }
        
        if (is_active !== undefined) {
            updateFields.push(`is_active = $${paramIndex++}`);
            queryParams.push(is_active);
        }
        
        // Always update the updated_at timestamp
        updateFields.push(`updated_at = NOW()`);
        
        // If no fields to update, return the existing learning path
        if (updateFields.length === 1) { // Only updated_at
            const getQuery = `SELECT * FROM learning_paths WHERE id = $1`;
            const { rows } = await db.query(getQuery, [pathId]);
            return res.status(200).json(rows[0]);
        }
        
        // Update the learning path
        const updateQuery = `
            UPDATE learning_paths
            SET ${updateFields.join(', ')}
            WHERE id = $1
            RETURNING *
        `;
        
        const { rows } = await db.query(updateQuery, queryParams);
        
        console.log(`[LearningPathService] Updated learning path ${pathId}`);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[LearningPathService] Error updating learning path ${pathId}:`, error);
        res.status(500).json({ error: 'Failed to update learning path' });
    }
});

// --- Delete Learning Path (Admin Only) ---
// DELETE /api/learning-paths/:id
router.delete('/:id', authorizeRole(['admin']), async (req, res) => {
    const pathId = req.params.id;
    
    console.log(`[LearningPathService] Received request to delete learning path ${pathId}`);
    
    try {
        // Check if learning path exists
        const checkQuery = `SELECT id FROM learning_paths WHERE id = $1`;
        const { rows: checkRows } = await db.query(checkQuery, [pathId]);
        
        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Learning path not found' });
        }
        
        // Delete the learning path (this will cascade to skills, resources, and user progress)
        const deleteQuery = `DELETE FROM learning_paths WHERE id = $1 RETURNING id`;
        const { rows } = await db.query(deleteQuery, [pathId]);
        
        console.log(`[LearningPathService] Deleted learning path ${pathId}`);
        res.status(200).json({ message: `Learning path ${pathId} deleted successfully` });
    } catch (error) {
        console.error(`[LearningPathService] Error deleting learning path ${pathId}:`, error);
        res.status(500).json({ error: 'Failed to delete learning path' });
    }
});

module.exports = router;
