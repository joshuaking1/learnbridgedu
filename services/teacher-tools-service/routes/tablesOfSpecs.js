// services/teacher-tools-service/routes/tablesOfSpecs.js
const express = require('express');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');
const router = express.Router();

// --- Create (Save) a New Table of Specifications (ToS) ---
// POST /api/teacher-tools/tos - Save new ToS
router.post('/', checkUsageLimit(usageLimitService.SERVICES.TABLE_OF_SPECIFICATION), async (req, res) => {
    const userId = req.user.userId;
    const { title, subject, book, assessmentTitle, coveredTopics, // Expect array or null/undefined
            objectiveWeight, subjectiveWeight, tosContent } = req.body;

    // --- Log Received Body ---
    console.log("[TeacherTools][POST /tos] Received Body:", req.body);

    if (!userId || !subject || !assessmentTitle || !tosContent) {
         console.error("[TeacherTools][POST /tos] Validation Failed: Missing required fields.");
         return res.status(400).json({ error: 'Missing required fields for saving ToS.' });
    }
    // Ensure coveredTopics is an array, default to empty if not provided or not array
    const topicsArray = (Array.isArray(coveredTopics) ? coveredTopics : []);
    const objWeight = objectiveWeight !== undefined ? parseInt(objectiveWeight) : null; // Parse or null
    const subjWeight = subjectiveWeight !== undefined ? parseInt(subjectiveWeight) : null; // Parse or null


    try {
        const insertQuery = `
            INSERT INTO tables_of_specs
            (user_id, title, subject, book, assessment_title, covered_topics, objective_weight, subjective_weight, tos_content)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
        `;
        const values = [
            userId,
            title || `ToS: ${assessmentTitle.substring(0,30)}...`,
            subject,
            null, // book field is now optional
            assessmentTitle,
            topicsArray, // Pass the processed array
            objWeight, // Pass parsed or null
            subjWeight, // Pass parsed or null
            tosContent
        ];

        // --- Log Values Before Query ---
        console.log("[TeacherTools][POST /tos] Values for DB Insert:", values);

        const result = await db.query(insertQuery, values);
        const savedTos = result.rows[0];

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.TABLE_OF_SPECIFICATION);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.TABLE_OF_SPECIFICATION
        );

        console.log(`[TeacherTools] ToS saved successfully with ID: ${savedTos.id} for user ${userId}`);
        res.status(201).json({
            ...savedTos,
            limitInfo
        });

    } catch (error) {
        console.error(`[TeacherTools] Error saving ToS for user ${userId}:`, error); // Log the full error
        res.status(500).json({ error: 'Internal Server Error saving ToS.' }); // Keep generic message for client
    }
});

// --- Get All Tables of Specifications (ToS) for User ---
// GET /api/teacher-tools/tos - Get all ToS for user
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    try {
        const query = `
            SELECT id, title, subject, book, assessment_title, created_at, updated_at
            FROM tables_of_specs WHERE user_id = $1 ORDER BY updated_at DESC;
        `;
        const { rows } = await db.query(query, [userId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching ToS for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching ToS.' });
    }
});

// GET /api/teacher-tools/tos/:id - Get single ToS
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
        const query = `SELECT * FROM tables_of_specs WHERE id = $1 AND user_id = $2;`;
        const { rows } = await db.query(query, [id, userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'ToS not found.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[TeacherTools] Error fetching ToS ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching ToS.' });
    }
});

// PUT /api/teacher-tools/tos/:id - Update ToS (e.g., title, content)
router.put('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    const { title, tosContent } = req.body; // Fields allowed to update
    if (!title && !tosContent) return res.status(400).json({ error: 'No fields provided for update.' });

    try {
        // Check ownership
        const check = await db.query('SELECT user_id FROM tables_of_specs WHERE id = $1', [id]);
        if (check.rows.length === 0 || parseInt(check.rows[0].user_id, 10) !== parseInt(userId, 10)) {
            return res.status(403).json({ error: 'Forbidden: You do not own this ToS.' });
        }
        // Build dynamic query
        const fields = [], values = []; let i = 1;
        if (title !== undefined) { fields.push(`title = $${i++}`); values.push(title); }
        if (tosContent !== undefined) { fields.push(`tos_content = $${i++}`); values.push(tosContent); }
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id); values.push(parseInt(userId, 10));
        const query = `UPDATE tables_of_specs SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *;`;
        const result = await db.query(query, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'ToS not found or update failed.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[TeacherTools] Error updating ToS ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error updating ToS.' });
    }
});

// DELETE /api/teacher-tools/tos/:id - Delete ToS
router.delete('/:id', async (req, res) => {
    const userId = req.user.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
    try {
        const query = `DELETE FROM tables_of_specs WHERE id = $1 AND user_id = $2 RETURNING id;`;
        const result = await db.query(query, [id, parseInt(userId, 10)]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'ToS not found or permission denied.' });
        res.status(204).send();
    } catch (error) {
        console.error(`[TeacherTools] Error deleting ToS ID ${id} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error deleting ToS.' });
    }
});

module.exports = router;