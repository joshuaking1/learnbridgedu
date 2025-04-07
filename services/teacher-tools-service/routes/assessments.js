// services/teacher-tools-service/routes/assessments.js
const express = require('express');
const db = require('../db'); // Adjust path

const router = express.Router();

// --- Create (Save) a New Assessment ---
// POST /api/teacher-tools/assessments
router.post('/', async (req, res) => {
    const userId = req.user.userId;
    const {
        title, subject, classLevel, topic, contentStandard,
        assessmentType, dokLevels, numQuestions, assessmentContent // Matches frontend payload
    } = req.body;

    // Validation
    if (!userId || !subject || !classLevel || !topic || !assessmentType || !dokLevels || !Array.isArray(dokLevels) || dokLevels.length === 0 || !numQuestions || !assessmentContent) {
        return res.status(400).json({ error: 'Missing required fields for saving assessment.' });
    }
    if (!dokLevels.every(level => typeof level === 'number' && level >= 1 && level <= 4)) {
         return res.status(400).json({ error: 'Invalid DoK Level(s) provided.' });
    }
     const qnCount = parseInt(numQuestions);
     if (isNaN(qnCount) || qnCount < 1) {
          return res.status(400).json({ error: 'Invalid number of questions.' });
     }


    console.log(`[TeacherTools] Received request to save assessment for user ${userId}, topic: ${topic}`);

    try {
        const insertQuery = `
            INSERT INTO assessments
            (user_id, title, subject, class_level, topic, content_standard, assessment_type, dok_levels, num_questions, assessment_content)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
        const values = [
            userId, title || `Assessment: ${topic.substring(0, 30)}...`, subject, classLevel, topic,
            contentStandard || null, assessmentType, dokLevels, // Pass array directly
            qnCount, assessmentContent
        ];

        const result = await db.query(insertQuery, values);
        const savedAssessment = result.rows[0];

        console.log(`[TeacherTools] Assessment saved successfully with ID: ${savedAssessment.id} for user ${userId}`);
        res.status(201).json(savedAssessment);

    } catch (error) {
        console.error(`[TeacherTools] Error saving assessment for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error saving assessment.' });
    }
});

// --- Get All Assessments for User ---
// GET /api/teacher-tools/assessments
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    console.log(`[TeacherTools] Received request to get all assessments for user ${userId}`);
    try {
        // Select summary fields
        const query = `
            SELECT id, title, subject, class_level, topic, assessment_type, created_at, updated_at
            FROM assessments
            WHERE user_id = $1
            ORDER BY updated_at DESC;
        `;
        const { rows } = await db.query(query, [userId]);
        console.log(`[TeacherTools] Found ${rows.length} assessments for user ${userId}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching assessments for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching assessments.' });
    }
});

// --- Get Single Assessment by ID ---
// GET /api/teacher-tools/assessments/:id
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const assessmentId = parseInt(req.params.id);
    if (isNaN(assessmentId)) { return res.status(400).json({ error: 'Invalid assessment ID.' }); }
    console.log(`[TeacherTools] Received request to get assessment ID: ${assessmentId} for user ${userId}`);
    try {
        const query = `SELECT * FROM assessments WHERE id = $1 AND user_id = $2;`;
        const { rows } = await db.query(query, [assessmentId, userId]);
        if (rows.length === 0) { return res.status(404).json({ error: 'Assessment not found.' }); }
        console.log(`[TeacherTools] Found assessment ID: ${assessmentId} for user ${userId}`);
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching assessment ID ${assessmentId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching assessment.' });
    }
});

// --- Update Assessment by ID ---
// PUT /api/teacher-tools/assessments/:id
router.put('/:id', async (req, res) => {
    const userId = req.user.userId;
    const assessmentId = parseInt(req.params.id);
    if (isNaN(assessmentId)) { return res.status(400).json({ error: 'Invalid assessment ID.' }); }

    // Allow updating title and content for now
    const { title, assessmentContent } = req.body;
    if (!title && !assessmentContent) { return res.status(400).json({ error: 'No fields provided for update.' }); }
    // Add validation if needed

    console.log(`[TeacherTools] Received request to update assessment ID: ${assessmentId} for user ${userId}`);
    try {
        // Check ownership
        const checkOwner = await db.query('SELECT user_id FROM assessments WHERE id = $1', [assessmentId]);
        if (checkOwner.rows.length === 0 || parseInt(checkOwner.rows[0].user_id, 10) !== parseInt(userId, 10)) {
            return res.status(403).json({ error: 'Forbidden: You do not own this assessment.' });
        }

        // Build update query
        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;
        if (title !== undefined) { fieldsToUpdate.push(`title = $${paramIndex++}`); values.push(title); }
        if (assessmentContent !== undefined) { fieldsToUpdate.push(`assessment_content = $${paramIndex++}`); values.push(assessmentContent); }
        fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(assessmentId); values.push(parseInt(userId, 10));

        const updateQuery = `UPDATE assessments SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *;`;
        const result = await db.query(updateQuery, values);

        if (result.rows.length === 0) { return res.status(404).json({ error: 'Assessment not found or update failed.' }); }

        console.log(`[TeacherTools] Assessment ID: ${assessmentId} updated successfully for user ${userId}`);
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(`[TeacherTools] Error updating assessment ID ${assessmentId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error updating assessment.' });
    }
});

// --- Delete Assessment by ID ---
// DELETE /api/teacher-tools/assessments/:id
router.delete('/:id', async (req, res) => {
    const userId = req.user.userId;
    const assessmentId = parseInt(req.params.id);
    if (isNaN(assessmentId)) { return res.status(400).json({ error: 'Invalid assessment ID.' }); }
    console.log(`[TeacherTools] Received request to delete assessment ID: ${assessmentId} for user ${userId}`);
    try {
        const query = `DELETE FROM assessments WHERE id = $1 AND user_id = $2 RETURNING id;`;
        const result = await db.query(query, [assessmentId, parseInt(userId, 10)]);
        if (result.rowCount === 0) { return res.status(404).json({ error: 'Assessment not found or you do not have permission to delete it.' }); }
        console.log(`[TeacherTools] Assessment ID: ${assessmentId} deleted successfully for user ${userId}`);
        res.status(204).send();
    } catch (error) {
        console.error(`[TeacherTools] Error deleting assessment ID ${assessmentId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error deleting assessment.' });
    }
});

module.exports = router;