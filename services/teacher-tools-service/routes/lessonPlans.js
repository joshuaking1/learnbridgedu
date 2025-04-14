// services/teacher-tools-service/routes/lessonPlans.js
const express = require('express');
const db = require('../db'); // Adjust path to db connection

const router = express.Router();

// --- Create (Save) a New Lesson Plan ---
// POST /api/teacher-tools/lessons
router.post('/', async (req, res) => {
    // User ID comes from the authenticateToken middleware (req.user.userId)
    const userId = req.user.userId;

    // Get lesson plan data from request body
    const {
        title, // Optional title from user
        subject,
        classLevel, // Ensure frontend sends this key name
        topic,
        duration,
        strand,
<<<<<<< HEAD
        subStrand, // Keep receiving subStrand
        week, // <-- Change from contentStandard
=======
        subStrand,
        contentStandard,
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505
        planContent // The generated Markdown content
    } = req.body;

    // --- Basic Validation ---
    // Check for essential fields needed to save
    // Using classLevel from request body
<<<<<<< HEAD
    if (!userId || !subject || !classLevel || !topic || !strand || !week || !planContent) { // Added strand/week as required, removed subStrand
        return res.status(400).json({ error: 'Missing required fields (userId, subject, classLevel, topic, strand, week, planContent).' });
    }
    console.log(`[TeacherTools] Received request to save lesson plan for user ${userId}, topic: ${topic}, week: ${week}`);


=======
    if (!userId || !subject || !classLevel || !topic || !planContent) {
        return res.status(400).json({ error: 'Missing required fields (userId, subject, classLevel, topic, planContent).' });
    }

    console.log(`[TeacherTools] Received request to save lesson plan for user ${userId}, topic: ${topic}`);
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505

    try {
        const insertQuery = `
            INSERT INTO lesson_plans
            (user_id, title, subject, class_level, topic, duration, strand, sub_strand, content_standard, plan_content)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *; -- Return the newly created lesson plan row
        `;
        const values = [
            userId,
            title || `Plan: ${topic.substring(0, 30)}...`, // Default title if none provided
            subject,
            classLevel, // Use classLevel from req.body
            topic,
            duration || null,
<<<<<<< HEAD
            strand, // Strand is now required in validation
            subStrand || null, // SubStrand is optional
            week, // <-- Insert 'week' value into the 'content_standard' DB column
=======
            strand || null,
            subStrand || null,
            contentStandard || null,
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505
            planContent
        ];

        const result = await db.query(insertQuery, values);
        const savedPlan = result.rows[0];

        console.log(`[TeacherTools] Lesson plan saved successfully with ID: ${savedPlan.id} for user ${userId}`);
        res.status(201).json(savedPlan); // Send back the created plan object

    } catch (error) {
        console.error(`[TeacherTools] Error saving lesson plan for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error saving lesson plan.' });
    }
});

// --- Get All Lesson Plans for User ---
// GET /api/teacher-tools/lessons
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    console.log(`[TeacherTools] Received request to get all lesson plans for user ${userId}`);

    try {
        // Select key fields, order by most recent
        const query = `
<<<<<<< HEAD
            SELECT id, title, subject, class_level, topic, content_standard AS week, created_at, updated_at
=======
            SELECT id, title, subject, class_level, topic, created_at, updated_at
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505
            FROM lesson_plans
            WHERE user_id = $1
            ORDER BY updated_at DESC;
        `;
        const { rows } = await db.query(query, [userId]);

        console.log(`[TeacherTools] Found ${rows.length} lesson plans for user ${userId}`);
        res.status(200).json(rows); // Send array of plans (summary view)

    } catch (error) {
        console.error(`[TeacherTools] Error fetching lesson plans for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching lesson plans.' });
    }
});

// --- Get Single Lesson Plan by ID ---
// GET /api/teacher-tools/lessons/:id
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const planId = parseInt(req.params.id);

    if (isNaN(planId)) {
        return res.status(400).json({ error: 'Invalid lesson plan ID.' });
    }
    console.log(`[TeacherTools] Received request to get lesson plan ID: ${planId} for user ${userId}`);

    try {
        // Fetch the specific plan, ensuring it belongs to the logged-in user
        const query = `
<<<<<<< HEAD
            SELECT id, user_id, title, subject, class_level, topic, duration, strand, sub_strand, content_standard AS week, plan_content, created_at, updated_at FROM lesson_plans WHERE id = $1 AND user_id = $2;
=======
            SELECT * FROM lesson_plans WHERE id = $1 AND user_id = $2;
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505
        `;
        const { rows } = await db.query(query, [planId, userId]);

        if (rows.length === 0) {
            console.log(`[TeacherTools] Lesson plan ID: ${planId} not found or not owned by user ${userId}`);
            return res.status(404).json({ error: 'Lesson plan not found.' });
        }

        console.log(`[TeacherTools] Found lesson plan ID: ${planId} for user ${userId}`);
        res.status(200).json(rows[0]); // Send the full plan details

    } catch (error) {
        console.error(`[TeacherTools] Error fetching lesson plan ID ${planId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching lesson plan.' });
    }
});


// --- Update Lesson Plan by ID ---
// PUT /api/teacher-tools/lessons/:id
router.put('/:id', async (req, res) => {
    const userId = req.user.userId; // This comes from the token payload (likely number)
    const planId = parseInt(req.params.id);

    if (isNaN(planId)) {
        return res.status(400).json({ error: 'Invalid lesson plan ID.' });
    }

<<<<<<< HEAD
    const { title, planContent, week } = req.body;
    if (!title && !planContent && !week) { return res.status(400).json({ error: 'No fields provided for update.' }); }
    if (planContent && typeof planContent !== 'string') { return res.status(400).json({ error: 'Invalid planContent provided.' }); }
    if (title && typeof title !== 'string') { return res.status(400).json({ error: 'Invalid title provided.' }); }
    if (week && typeof week !== 'string') { return res.status(400).json({ error: 'Invalid week provided.' }); }

    console.log(`[TeacherTools] Received request to update lesson plan ID: ${planId} for user ${userId}${week ? `, week: ${week}` : ''}`);
=======
    const { title, planContent } = req.body;
    if (!title && !planContent) { return res.status(400).json({ error: 'No fields provided for update.' }); }
    if (planContent && typeof planContent !== 'string') { return res.status(400).json({ error: 'Invalid planContent provided.' }); }
    if (title && typeof title !== 'string') { return res.status(400).json({ error: 'Invalid title provided.' }); }

    console.log(`[TeacherTools] Received request to update lesson plan ID: ${planId} for user ${userId}`);
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505

    try {
        // Check ownership first
        const checkOwner = await db.query('SELECT user_id FROM lesson_plans WHERE id = $1', [planId]);
        console.log(`[Ownership Check] Plan ID: ${planId}, Found Rows: ${checkOwner.rows.length}`);

        let dbUserId = null;
        if (checkOwner.rows.length > 0) {
             dbUserId = checkOwner.rows[0].user_id; // Get the value from DB (might be string or number)
             console.log(`[Ownership Check] DB user_id: ${dbUserId} (Type: ${typeof dbUserId}), Token userId: ${userId} (Type: ${typeof userId})`);
        }

        // --- FIX: Compare as numbers using parseInt ---
        // Ensure both userId and dbUserId are treated as integers for comparison
        if (checkOwner.rows.length === 0 || parseInt(dbUserId, 10) !== parseInt(userId, 10)) {
             console.error(`[Ownership Check Failed] Plan ${planId}. Owner in DB: ${dbUserId ?? 'Not Found'}. Requesting User: ${userId}. Comparison failed due to value or type mismatch.`);
             return res.status(403).json({ error: 'Forbidden: You do not own this lesson plan.' });
        }
        // --- END FIX ---


        // Build the update query dynamically
        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;

        if (title !== undefined) {
            fieldsToUpdate.push(`title = $${paramIndex++}`);
            values.push(title);
        }
        if (planContent !== undefined) {
            fieldsToUpdate.push(`plan_content = $${paramIndex++}`);
            values.push(planContent);
        }
<<<<<<< HEAD
        if (week !== undefined) {
            fieldsToUpdate.push(`content_standard = $${paramIndex++}`);
            values.push(week);
        }
=======
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505
        fieldsToUpdate.push(`updated_at = CURRENT_TIMESTAMP`);

        // Add the planId and userId for the WHERE clause (use parsed types)
        values.push(planId); // Already parsed
        values.push(parseInt(userId, 10)); // Ensure userId is number for WHERE

        const updateQuery = `
            UPDATE lesson_plans
            SET ${fieldsToUpdate.join(', ')}
            WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
            RETURNING *;
        `;

        const result = await db.query(updateQuery, values);

        if (result.rows.length === 0) {
            console.warn(`[TeacherTools] Update failed for plan ID: ${planId}, user ${userId}. Plan might have been deleted.`);
            return res.status(404).json({ error: 'Lesson plan not found or update failed.' });
        }

<<<<<<< HEAD
        // Fetch again to get the aliased column if RETURNING * doesn't alias
        const selectQuery = `SELECT *, content_standard AS week FROM lesson_plans WHERE id = $1`;
        const updatedResult = await db.query(selectQuery, [result.rows[0].id]);

        console.log(`[TeacherTools] Lesson plan ID: ${planId} updated successfully for user ${userId}`);
        res.status(200).json(updatedResult.rows[0]); // Return updated plan with aliased 'week'
=======
        console.log(`[TeacherTools] Lesson plan ID: ${planId} updated successfully for user ${userId}`);
        res.status(200).json(result.rows[0]); // Return the updated plan
>>>>>>> 257007db798ad15fdcbf6cdb4d5be65a48687505

    } catch (error) {
        console.error(`[TeacherTools] Error updating lesson plan ID ${planId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error updating lesson plan.' });
    }
});

// --- Delete Lesson Plan by ID ---
// DELETE /api/teacher-tools/lessons/:id
router.delete('/:id', async (req, res) => {
    const userId = req.user.userId; // Likely number
    const planId = parseInt(req.params.id);

    if (isNaN(planId)) {
        return res.status(400).json({ error: 'Invalid lesson plan ID.' });
    }
    console.log(`[TeacherTools] Received request to delete lesson plan ID: ${planId} for user ${userId}`);

    try {
        // Delete the plan ONLY if the ID matches AND it belongs to the logged-in user
        const query = `
            DELETE FROM lesson_plans WHERE id = $1 AND user_id = $2 RETURNING id;
        `;
        // Ensure userId used in WHERE clause is number
        const result = await db.query(query, [planId, parseInt(userId, 10)]);

        if (result.rowCount === 0) {
            console.log(`[TeacherTools] Lesson plan ID: ${planId} not found or not owned by user ${userId} for deletion.`);
            return res.status(404).json({ error: 'Lesson plan not found or you do not have permission to delete it.' });
        }

        console.log(`[TeacherTools] Lesson plan ID: ${planId} deleted successfully for user ${userId}`);
        res.status(204).send(); // Send No Content success status

    } catch (error) {
        console.error(`[TeacherTools] Error deleting lesson plan ID ${planId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error deleting lesson plan.' });
    }
});


module.exports = router; // Export the router