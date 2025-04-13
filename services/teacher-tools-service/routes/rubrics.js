// services/teacher-tools-service/routes/rubrics.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// POST /api/teacher-tools/rubrics - Save new Rubric
// services/teacher-tools-service/routes/rubrics.js

router.post('/', async (req, res) => {
    const userId = req.user.userId;
    const { title, assessmentTitle, assessmentType, classLevel,
            taskDescription, maxScore, rubricContent } = req.body;

    // --- Log Received Body ---
    console.log("[TeacherTools][POST /rubrics] Received Body:", req.body);

    if (!userId || !assessmentTitle || !assessmentType || !classLevel || !rubricContent) {
         console.error("[TeacherTools][POST /rubrics] Validation Failed: Missing required fields.");
         return res.status(400).json({ error: 'Missing required fields for saving rubric.' });
    }
    // Ensure maxScore is null if not a valid positive number
    const score = (maxScore && !isNaN(parseInt(maxScore)) && parseInt(maxScore) > 0) ? parseInt(maxScore) : null;

    try {
        const insertQuery = `
            INSERT INTO rubrics
            (user_id, title, assessment_title, assessment_type, class_level, task_description, max_score, rubric_content)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
        `;
        const values = [
            userId,
            title || `Rubric: ${assessmentTitle.substring(0,30)}...`,
            assessmentTitle,
            assessmentType,
            classLevel,
            taskDescription || null, // Allow null task description
            score, // Use processed score (number or null)
            rubricContent
        ];

        // --- Log Values Before Query ---
        console.log("[TeacherTools][POST /rubrics] Values for DB Insert:", values);

        const result = await db.query(insertQuery, values);
        const savedRubric = result.rows[0];

        console.log(`[TeacherTools] Rubric saved successfully with ID: ${savedRubric.id} for user ${userId}`);
        res.status(201).json(savedRubric);

    } catch (error) {
        console.error(`[TeacherTools] Error saving rubric for user ${userId}:`, error); // Log the full error
        res.status(500).json({ error: 'Internal Server Error saving rubric.' }); // Keep generic message for client
    }
});

// ... rest of rubrics.js ...

// GET /api/teacher-tools/rubrics - Get all rubrics for user
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    try {
        const query = `
            SELECT id, title, assessment_title, assessment_type, class_level, created_at, updated_at
            FROM rubrics WHERE user_id = $1 ORDER BY updated_at DESC;
        `;
        const { rows } = await db.query(query, [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching rubrics for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching rubrics.' });
    }
});

// GET /api/teacher-tools/rubrics/:id - Get single rubric
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
        const query = `SELECT * FROM rubrics WHERE id = $1 AND user_id = $2;`;
        const { rows } = await db.query(query, [id, userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Rubric not found.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching rubric ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching rubric.' });
    }
});

// PUT /api/teacher-tools/rubrics/:id - Update rubric (title, content)
router.put('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    const { title, rubricContent } = req.body;
    if (!title && !rubricContent) return res.status(400).json({ error: 'No fields provided for update.' });

    try {
        const check = await db.query('SELECT user_id FROM rubrics WHERE id = $1', [id]);
        if (check.rows.length === 0 || parseInt(check.rows[0].user_id, 10) !== parseInt(userId, 10)) {
            return res.status(403).json({ error: 'Forbidden: You do not own this rubric.' });
        }
        const fields = [], values = []; let i = 1;
        if (title !== undefined) { fields.push(`title = $${i++}`); values.push(title); }
        if (rubricContent !== undefined) { fields.push(`rubric_content = $${i++}`); values.push(rubricContent); }
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id); values.push(parseInt(userId, 10));
        const query = `UPDATE rubrics SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *;`;
        const result = await db.query(query, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Rubric not found or update failed.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[TeacherTools] Error updating rubric ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error updating rubric.' });
    }
});

// DELETE /api/teacher-tools/rubrics/:id - Delete rubric
router.delete('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
        const query = `DELETE FROM rubrics WHERE id = $1 AND user_id = $2 RETURNING id;`;
        const result = await db.query(query, [id, parseInt(userId, 10)]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Rubric not found or permission denied.' });
        res.status(204).send();
    } catch (error) {
        console.error(`[TeacherTools] Error deleting rubric ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error deleting rubric.' });
    }
});

module.exports = router;