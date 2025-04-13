// services/quiz-service/routes/quizzes.js
const express = require('express');
const db = require('../db'); // Adjust path if needed

const router = express.Router();

// --- Get List of Available Quizzes (with optional filters) ---
// GET /api/quizzes?subject=Science&book=Book 1&topic=Cells
router.get('/', async (req, res) => {
    const userId = req.user.userId; // User must be logged in to see quizzes
    const { subject, book, topic } = req.query; // Get optional filters

    console.log(`[QuizService] Request received to list quizzes for user ${userId}. Filters:`, req.query);

    try {
        let query = `
            SELECT id, title, subject, book, topic, description, created_at
            FROM quizzes
        `; // Select summary fields
        const values = [];
        const conditions = [];
        let paramIndex = 1;

        // Add filters dynamically
        if (subject) {
            conditions.push(`subject ILIKE $${paramIndex++}`); // Case-insensitive search
            values.push(`%${subject}%`);
        }
        if (book) {
            conditions.push(`book = $${paramIndex++}`); // Exact match for book? Or ILIKE? Let's use exact for now.
            values.push(book);
        }
        if (topic) {
            conditions.push(`topic ILIKE $${paramIndex++}`);
            values.push(`%${topic}%`);
        }

        // Append WHERE clause if filters exist
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY created_at DESC;`; // Order by newest first

        console.log(`[QuizService] Executing query: ${query.substring(0, 100)}... with values:`, values);
        const { rows } = await db.query(query, values);

        console.log(`[QuizService] Found ${rows.length} quizzes matching criteria.`);
        res.status(200).json(rows); // Send array of quizzes

    } catch (error) {
        console.error(`[QuizService] Error fetching quizzes for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching quizzes.' });
    }
});

// --- Get Quiz Metadata ---
// GET /api/quizzes/:id - Get quiz metadata (excluding questions)
router.get('/:id', async (req, res) => {
    const userId = req.user.userId; // Still need auth to view quiz details
    const quizId = parseInt(req.params.id);
    if (isNaN(quizId)) { return res.status(400).json({ error: 'Invalid quiz ID.' }); }
    console.log(`[QuizService] Request for quiz metadata ID: ${quizId}`);
    try {
        // Select only quiz metadata, not questions here
        const query = `SELECT id, title, subject, book, topic, description, created_by, created_at FROM quizzes WHERE id = $1;`;
        const { rows } = await db.query(query, [quizId]);
        if (rows.length === 0) { return res.status(404).json({ error: 'Quiz not found.' }); }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(`[QuizService] Error fetching quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching quiz details.' });
    }
});

// --- Get Questions for a Quiz (for student taking quiz) ---
// GET /api/quizzes/:id/questions
router.get('/:id/questions', async (req, res) => {
    const userId = req.user.userId; // User must be logged in
    const quizId = parseInt(req.params.id);
    if (isNaN(quizId)) { return res.status(400).json({ error: 'Invalid quiz ID.' }); }

    console.log(`[QuizService] Request for questions for quiz ID: ${quizId} by user ${userId}`);

    try {
        // Fetch questions for the quiz, EXCLUDING the correct answer and explanation
        const query = `
            SELECT id, quiz_id, question_type, question_text, options
            FROM quiz_questions
            WHERE quiz_id = $1
            ORDER BY id ASC; -- Or some other consistent order
        `;
        const { rows } = await db.query(query, [quizId]);

        if (rows.length === 0) {
            // Check if quiz itself exists, maybe return different error?
            const quizCheck = await db.query('SELECT id FROM quizzes WHERE id = $1', [quizId]);
            if (quizCheck.rows.length === 0) {
                 return res.status(404).json({ error: 'Quiz not found.' });
            } else {
                 return res.status(404).json({ error: 'No questions found for this quiz.' });
            }
        }

        console.log(`[QuizService] Found ${rows.length} questions for quiz ID: ${quizId}`);
        // TODO: Potentially randomize question order or options order here if desired
        res.status(200).json(rows); // Send array of question objects

    } catch (error) {
        console.error(`[QuizService] Error fetching questions for quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching questions.' });
    }
});

// --- Submit Quiz Attempt ---
// POST /api/quizzes/attempts/:quizId
router.post('/attempts/:quizId', async (req, res) => {
    const userId = req.user.userId; // Student submitting
    const quizId = parseInt(req.params.quizId);
    const submittedAnswers = req.body.answers; // Expect format like: { "questionId1": "selectedAnswerText", "questionId2": "selectedAnswerText", ... }

    if (isNaN(quizId)) { return res.status(400).json({ error: 'Invalid quiz ID.' }); }
    if (!submittedAnswers || typeof submittedAnswers !== 'object' || Object.keys(submittedAnswers).length === 0) {
        return res.status(400).json({ error: 'Invalid or empty answers submitted.' });
    }

    console.log(`[QuizService] Received attempt for quiz ID: ${quizId} by user ${userId}`);

    try {
        // 1. Fetch Correct Answers and Total Questions for Grading
        const questionsQuery = `
            SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1;
        `;
        const { rows: questions } = await db.query(questionsQuery, [quizId]);

        if (questions.length === 0) {
            return res.status(404).json({ error: 'Quiz or questions not found for grading.' });
        }

        // 2. Grade the attempt
        let score = 0;
        const totalQuestions = questions.length;
        const gradedAnswers = {}; // Store results if needed

        for (const question of questions) {
            const questionId = question.id.toString(); // Ensure keys match (DB ID might be bigint/string)
            const correctAnswer = question.correct_answer;
            const submittedAnswer = submittedAnswers[questionId];

            // Simple comparison (case-insensitive, trim whitespace)
            if (submittedAnswer && correctAnswer &&
                submittedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
                score++;
                gradedAnswers[questionId] = 'correct';
            } else {
                gradedAnswers[questionId] = 'incorrect';
            }
        }

        const percentage = totalQuestions > 0 ? parseFloat(((score / totalQuestions) * 100).toFixed(2)) : 0;
        console.log(`[QuizService] Grading complete for quiz ${quizId}, user ${userId}. Score: ${score}/${totalQuestions} (${percentage}%)`);

        // 3. Save the attempt to the database
        const attemptQuery = `
            INSERT INTO student_quiz_attempts
            (user_id, quiz_id, score, total_questions, percentage, answers_given)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, score, total_questions, percentage, attempted_at; -- Return summary
        `;
        // Store submitted answers as JSONB
        const values = [userId, quizId, score, totalQuestions, percentage, submittedAnswers];

        const { rows: attemptResult } = await db.query(attemptQuery, values);
        const savedAttempt = attemptResult[0];

        console.log(`[QuizService] Attempt ID ${savedAttempt.id} saved for user ${userId}, quiz ${quizId}.`);

        // 4. Return results to the frontend
        res.status(201).json({
            message: "Attempt submitted successfully!",
            attemptId: savedAttempt.id,
            score: savedAttempt.score,
            totalQuestions: savedAttempt.total_questions,
            percentage: savedAttempt.percentage,
            attemptedAt: savedAttempt.attempted_at,
            // Optionally return gradedAnswers or correct answers for immediate feedback
            // gradedAnswers: gradedAnswers
        });

    } catch (error) {
        console.error(`[QuizService] Error submitting attempt for quiz ${quizId}, user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error submitting attempt.' });
    }
});

// --- Get Attempts for Logged-in User ---
// GET /api/quizzes/attempts/my
router.get('/attempts/my', async (req, res) => {
    // User ID comes from authenticateToken middleware
    const userId = req.user.userId;

    console.log(`[QuizService] Request received for quiz attempt history for user ${userId}`);

    try {
        // Query to join attempts with quiz metadata for better display
        const query = `
            SELECT
                sa.id AS attempt_id,
                sa.quiz_id,
                sa.score,
                sa.total_questions,
                sa.percentage,
                sa.attempted_at,
                q.title AS quiz_title,
                q.subject AS quiz_subject,
                q.book AS quiz_book,
                q.topic AS quiz_topic
            FROM student_quiz_attempts sa
            JOIN quizzes q ON sa.quiz_id = q.id
            WHERE sa.user_id = $1
            ORDER BY sa.attempted_at DESC; -- Show most recent attempts first
        `;
        const values = [userId];

        const { rows } = await db.query(query, values);

        console.log(`[QuizService] Found ${rows.length} quiz attempts for user ${userId}`);
        res.status(200).json(rows); // Send array of attempt objects with quiz info

    } catch (error) {
        console.error(`[QuizService] Error fetching attempt history for user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching attempt history.' });
    }
});

// --- Get Data for Reviewing a Specific Attempt ---
// GET /api/quizzes/attempts/:attemptId/review
router.get('/attempts/:attemptId/review', async (req, res) => {
    const userId = req.user.userId; // User requesting the review
    const attemptId = parseInt(req.params.attemptId);

    if (isNaN(attemptId)) {
        return res.status(400).json({ error: 'Invalid attempt ID.' });
    }

    console.log(`[QuizService] Request received to review attempt ID: ${attemptId} by user ${userId}`);

    try {
        // 1. Fetch the specific attempt details, ensuring ownership
        const attemptQuery = `
            SELECT id, user_id, quiz_id, score, total_questions, percentage, answers_given, attempted_at
            FROM student_quiz_attempts
            WHERE id = $1 AND user_id = $2;
        `;
        const { rows: attemptRows } = await db.query(attemptQuery, [attemptId, userId]);

        if (attemptRows.length === 0) {
            console.log(`[QuizService] Attempt ID ${attemptId} not found or not owned by user ${userId}.`);
            return res.status(404).json({ error: 'Quiz attempt not found or access denied.' });
        }
        const attempt = attemptRows[0];
        const quizId = attempt.quiz_id; // Get the quiz ID from the attempt

        // 2. Fetch the corresponding quiz questions WITH answers and explanations
        const questionsQuery = `
            SELECT id, question_type, question_text, options, correct_answer, explanation
            FROM quiz_questions
            WHERE quiz_id = $1
            ORDER BY id ASC; -- Maintain consistent order
        `;
        const { rows: questions } = await db.query(questionsQuery, [quizId]);

        if (questions.length === 0) {
            // This shouldn't happen if an attempt exists, but good safety check
            console.error(`[QuizService] No questions found for quiz ID ${quizId} associated with attempt ${attemptId}.`);
            return res.status(500).json({ error: 'Internal error: Could not retrieve questions for this attempt.' });
        }

        console.log(`[QuizService] Found attempt ${attemptId} and ${questions.length} questions for review by user ${userId}.`);

        // 3. Combine and return the data
        res.status(200).json({
            attempt: {
                id: attempt.id,
                quizId: attempt.quiz_id,
                score: attempt.score,
                totalQuestions: attempt.total_questions,
                percentage: attempt.percentage,
                attemptedAt: attempt.attempted_at,
                submittedAnswers: attempt.answers_given // The student's answers { qId: answer }
            },
            questions: questions // Array of questions including correct answers/explanations
        });

    } catch (error) {
        console.error(`[QuizService] Error fetching review data for attempt ${attemptId}, user ${userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching review data.' });
    }
});

module.exports = router;