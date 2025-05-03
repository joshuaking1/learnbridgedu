const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeRole = require('../middleware/authorizeRole');

// Get student's learning progress
router.get('/progress', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const userId = req.user.userId;

    try {
        const query = `
            SELECT 
                lp.id as learning_path_id,
                lp.title as learning_path_title,
                lp.description as learning_path_description,
                sp.progress_percentage,
                sp.last_accessed,
                sp.completed_modules,
                sp.total_modules
            FROM student_progress sp
            JOIN learning_paths lp ON sp.learning_path_id = lp.id
            WHERE sp.student_id = $1
            ORDER BY sp.last_accessed DESC
        `;
        
        const result = await db.query(query, [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching student progress:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get student's recent activities
router.get('/recent-activities', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const userId = req.user.userId;

    try {
        const query = `
            SELECT 
                activity_type,
                activity_data,
                created_at
            FROM student_activities
            WHERE student_id = $1
            ORDER BY created_at DESC
            LIMIT 10
        `;
        
        const result = await db.query(query, [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching recent activities:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get student's achievements
router.get('/achievements', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const userId = req.user.userId;

    try {
        const query = `
            SELECT 
                a.id,
                a.title,
                a.description,
                a.icon_url,
                sa.earned_at
            FROM student_achievements sa
            JOIN achievements a ON sa.achievement_id = a.id
            WHERE sa.student_id = $1
            ORDER BY sa.earned_at DESC
        `;
        
        const result = await db.query(query, [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching achievements:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update learning progress
router.post('/progress/update', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const userId = req.user.userId;
    const { learningPathId, progressPercentage, completedModules, totalModules } = req.body;

    try {
        const query = `
            INSERT INTO student_progress 
                (student_id, learning_path_id, progress_percentage, completed_modules, total_modules, last_accessed)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (student_id, learning_path_id) 
            DO UPDATE SET 
                progress_percentage = $3,
                completed_modules = $4,
                total_modules = $5,
                last_accessed = NOW()
            RETURNING *
        `;
        
        const values = [userId, learningPathId, progressPercentage, completedModules, totalModules];
        const result = await db.query(query, values);
        
        // Log activity
        await db.query(
            `INSERT INTO student_activities (student_id, activity_type, activity_data)
             VALUES ($1, 'progress_update', $2)`,
            [userId, JSON.stringify({ learningPathId, progressPercentage })]
        );

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error updating progress:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 