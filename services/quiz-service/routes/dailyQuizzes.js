// services/quiz-service/routes/dailyQuizzes.js
const express = require('express');
const db = require('../db');
const { triggerDailyQuizGeneration } = require('../scheduler');
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');

const router = express.Router();

// --- Get Today's Daily Quizzes ---
// GET /api/daily-quizzes
router.get('/', async (req, res) => {
    const userId = req.user.userId;
    const { subject, book } = req.query; // Optional filters

    console.log(`[QuizService] Request for today's daily quizzes from user ${userId}. Filters:`, req.query);

    try {
        let query = `
            SELECT dq.id, dq.subject, dq.book, dq.topic, dq.title, dq.description, dq.quiz_date,
                   CASE WHEN dqa.id IS NOT NULL THEN true ELSE false END AS attempted
            FROM daily_quizzes dq
            LEFT JOIN daily_quiz_attempts dqa ON dq.id = dqa.daily_quiz_id AND dqa.user_id = $1
            WHERE dq.quiz_date = CURRENT_DATE AND dq.is_active = true
        `;

        const values = [userId];
        const conditions = [];
        let paramIndex = 2;

        // Add filters dynamically
        if (subject) {
            conditions.push(`dq.subject ILIKE $${paramIndex++}`);
            values.push(`%${subject}%`);
        }

        if (book) {
            conditions.push(`dq.book = $${paramIndex++}`);
            values.push(book);
        }

        // Append WHERE clause if filters exist
        if (conditions.length > 0) {
            query += ` AND ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY dq.subject, dq.book`;

        const { rows } = await db.query(query, values);

        console.log(`[QuizService] Found ${rows.length} daily quizzes for today`);
        res.status(200).json(rows);
    } catch (error) {
        console.error('[QuizService] Error fetching daily quizzes:', error);
        res.status(500).json({ error: 'Internal Server Error fetching daily quizzes.' });
    }
});

// --- Get Daily Quiz Details ---
// GET /api/daily-quizzes/:id
router.get('/:id', async (req, res) => {
    const userId = req.user.userId;
    const quizId = parseInt(req.params.id);

    if (isNaN(quizId)) {
        return res.status(400).json({ error: 'Invalid quiz ID.' });
    }

    console.log(`[QuizService] Request for daily quiz details ID: ${quizId} from user ${userId}`);

    try {
        // Check if the quiz exists and is for today
        const quizQuery = `
            SELECT id, subject, book, topic, title, description, quiz_date
            FROM daily_quizzes
            WHERE id = $1 AND is_active = true;
        `;

        const { rows: quizRows } = await db.query(quizQuery, [quizId]);

        if (quizRows.length === 0) {
            return res.status(404).json({ error: 'Daily quiz not found or not active.' });
        }

        // Check if the user has already attempted this quiz
        const attemptQuery = `
            SELECT id FROM daily_quiz_attempts
            WHERE daily_quiz_id = $1 AND user_id = $2;
        `;

        const { rows: attemptRows } = await db.query(attemptQuery, [quizId, userId]);

        const quiz = {
            ...quizRows[0],
            attempted: attemptRows.length > 0
        };

        res.status(200).json(quiz);
    } catch (error) {
        console.error(`[QuizService] Error fetching daily quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching daily quiz details.' });
    }
});

// --- Get Questions for a Daily Quiz ---
// GET /api/daily-quizzes/:id/questions
router.get('/:id/questions', async (req, res) => {
    const userId = req.user.userId;
    const quizId = parseInt(req.params.id);

    if (isNaN(quizId)) {
        return res.status(400).json({ error: 'Invalid quiz ID.' });
    }

    console.log(`[QuizService] Request for questions for daily quiz ID: ${quizId} from user ${userId}`);

    try {
        // Check if the user has already attempted this quiz
        const attemptQuery = `
            SELECT id FROM daily_quiz_attempts
            WHERE daily_quiz_id = $1 AND user_id = $2;
        `;

        const { rows: attemptRows } = await db.query(attemptQuery, [quizId, userId]);

        if (attemptRows.length > 0) {
            return res.status(403).json({
                error: 'You have already attempted this daily quiz.',
                attemptId: attemptRows[0].id
            });
        }

        // Fetch questions for the quiz, EXCLUDING the correct answer and explanation
        const questionsQuery = `
            SELECT id, question_type, question_text, options
            FROM daily_quiz_questions
            WHERE daily_quiz_id = $1
            ORDER BY id ASC;
        `;

        const { rows: questions } = await db.query(questionsQuery, [quizId]);

        if (questions.length === 0) {
            return res.status(404).json({ error: 'No questions found for this daily quiz.' });
        }

        console.log(`[QuizService] Found ${questions.length} questions for daily quiz ID: ${quizId}`);
        res.status(200).json(questions);
    } catch (error) {
        console.error(`[QuizService] Error fetching questions for daily quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching daily quiz questions.' });
    }
});

// --- Submit Daily Quiz Attempt ---
// POST /api/daily-quizzes/:id/attempt
router.post('/:id/attempt', checkUsageLimit(usageLimitService.SERVICES.QUIZ_ATTEMPT), async (req, res) => {
    const userId = req.user.userId;
    const quizId = parseInt(req.params.id);
    const submittedAnswers = req.body.answers;

    if (isNaN(quizId)) {
        return res.status(400).json({ error: 'Invalid quiz ID.' });
    }

    if (!submittedAnswers || typeof submittedAnswers !== 'object' || Object.keys(submittedAnswers).length === 0) {
        return res.status(400).json({ error: 'Invalid or empty answers submitted.' });
    }

    console.log(`[QuizService] Received attempt for daily quiz ID: ${quizId} by user ${userId}`);

    try {
        // Check if the user has already attempted this quiz
        const attemptQuery = `
            SELECT id FROM daily_quiz_attempts
            WHERE daily_quiz_id = $1 AND user_id = $2;
        `;

        const { rows: attemptRows } = await db.query(attemptQuery, [quizId, userId]);

        if (attemptRows.length > 0) {
            return res.status(403).json({
                error: 'You have already attempted this daily quiz.',
                attemptId: attemptRows[0].id
            });
        }

        // 1. Fetch Correct Answers and Total Questions for Grading
        const questionsQuery = `
            SELECT id, correct_answer FROM daily_quiz_questions WHERE daily_quiz_id = $1;
        `;

        const { rows: questions } = await db.query(questionsQuery, [quizId]);

        if (questions.length === 0) {
            return res.status(404).json({ error: 'Daily quiz or questions not found for grading.' });
        }

        // 2. Grade the attempt
        let score = 0;
        const totalQuestions = questions.length;

        for (const question of questions) {
            const questionId = question.id.toString();
            const correctAnswer = question.correct_answer;
            const submittedAnswer = submittedAnswers[questionId];

            if (submittedAnswer && submittedAnswer === correctAnswer) {
                score++;
            }
        }

        const percentage = totalQuestions > 0 ? parseFloat(((score / totalQuestions) * 100).toFixed(2)) : 0;

        console.log(`[QuizService] Grading complete for daily quiz ${quizId}, user ${userId}. Score: ${score}/${totalQuestions} (${percentage}%)`);

        // 3. Save the attempt to the database
        const saveAttemptQuery = `
            INSERT INTO daily_quiz_attempts
            (user_id, daily_quiz_id, score, total_questions, percentage, answers_given)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, score, total_questions, percentage, attempted_at;
        `;

        const values = [userId, quizId, score, totalQuestions, percentage, submittedAnswers];

        const { rows: attemptResult } = await db.query(saveAttemptQuery, values);
        const savedAttempt = attemptResult[0];

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.QUIZ_ATTEMPT);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.QUIZ_ATTEMPT
        );

        // 4. Return the results
        res.status(201).json({
            message: 'Daily quiz attempt submitted successfully.',
            attemptId: savedAttempt.id,
            score: savedAttempt.score,
            totalQuestions: savedAttempt.total_questions,
            percentage: savedAttempt.percentage,
            attemptedAt: savedAttempt.attempted_at,
            limitInfo
        });
    } catch (error) {
        console.error(`[QuizService] Error processing daily quiz attempt for quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error processing daily quiz attempt.' });
    }
});

// --- Get Daily Quiz Attempt Results ---
// GET /api/daily-quizzes/:id/results
router.get('/:id/results', async (req, res) => {
    const userId = req.user.userId;
    const quizId = parseInt(req.params.id);

    if (isNaN(quizId)) {
        return res.status(400).json({ error: 'Invalid quiz ID.' });
    }

    console.log(`[QuizService] Request for daily quiz results ID: ${quizId} from user ${userId}`);

    try {
        // Get the user's attempt
        const attemptQuery = `
            SELECT id, score, total_questions, percentage, answers_given, attempted_at
            FROM daily_quiz_attempts
            WHERE daily_quiz_id = $1 AND user_id = $2;
        `;

        const { rows: attemptRows } = await db.query(attemptQuery, [quizId, userId]);

        if (attemptRows.length === 0) {
            return res.status(404).json({ error: 'No attempt found for this daily quiz.' });
        }

        const attempt = attemptRows[0];

        // Get the quiz questions with correct answers
        const questionsQuery = `
            SELECT id, question_type, question_text, options, correct_answer, explanation
            FROM daily_quiz_questions
            WHERE daily_quiz_id = $1
            ORDER BY id ASC;
        `;

        const { rows: questions } = await db.query(questionsQuery, [quizId]);

        // Combine the attempt and questions
        const results = {
            attemptId: attempt.id,
            score: attempt.score,
            totalQuestions: attempt.total_questions,
            percentage: attempt.percentage,
            attemptedAt: attempt.attempted_at,
            questions: questions.map(q => ({
                id: q.id,
                type: q.question_type,
                text: q.question_text,
                options: q.options,
                correctAnswer: q.correct_answer,
                explanation: q.explanation,
                userAnswer: attempt.answers_given[q.id.toString()],
                isCorrect: attempt.answers_given[q.id.toString()] === q.correct_answer
            }))
        };

        res.status(200).json(results);
    } catch (error) {
        console.error(`[QuizService] Error fetching daily quiz results for quiz ${quizId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching daily quiz results.' });
    }
});

// --- Get User's Usage Limits ---
// GET /api/daily-quizzes/limits
router.get('/limits', async (req, res) => {
    const user = req.user;

    console.log(`[QuizService] Request for usage limits from user ${user.userId}`);

    try {
        const usageStats = await usageLimitService.getUserUsageStats(user);
        res.status(200).json(usageStats);
    } catch (error) {
        console.error(`[QuizService] Error fetching usage limits for user ${user.userId}:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching usage limits.' });
    }
});

// --- Admin: Manually Trigger Daily Quiz Generation ---
// POST /api/daily-quizzes/generate
// This route should be protected with admin role check and usage limits
router.post('/generate', checkUsageLimit(usageLimitService.SERVICES.DAILY_QUIZ), async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    console.log(`[QuizService] Admin ${req.user.userId} triggered manual daily quiz generation`);

    try {
        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.DAILY_QUIZ);
        }

        const results = await triggerDailyQuizGeneration();

        // Get updated limit info to return to the client
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.DAILY_QUIZ
        );

        res.status(200).json({
            message: 'Daily quiz generation triggered successfully.',
            results,
            limitInfo
        });
    } catch (error) {
        console.error('[QuizService] Error triggering daily quiz generation:', error);
        res.status(500).json({ error: 'Internal Server Error triggering daily quiz generation.' });
    }
});

module.exports = router;
