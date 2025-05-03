// services/quiz-service/services/dailyQuizGenerator.js
const db = require('../db');
const axios = require('axios');
const { Pool } = require('pg'); // Ensure Pool is imported if not already

/**
 * Service for generating daily quizzes for SBC books
 */
class DailyQuizGenerator {
    constructor() {
        this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:3004';
        this.serviceToken = process.env.SERVICE_TOKEN; // Token for AI service auth
        this.notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3008'; // Notification service URL
        this.internalApiKey = process.env.INTERNAL_SERVICE_API_KEY; // Internal API key

        if (!this.serviceToken) {
            console.warn('[DailyQuizGenerator] SERVICE_TOKEN environment variable not set. AI-generated quizzes will not be available. Using fallback template quizzes instead.');
        }
        if (!this.notificationServiceUrl || !this.internalApiKey) {
            console.warn('[DailyQuizGenerator] Notification service URL or internal API key not configured. New quiz notifications will not be sent.');
        }
    }

    /**
     * Get all books from the SBC
     * @returns {Promise<Array>} List of books
     */
    async getAllSbcBooks() {
        try {
            console.log('[DailyQuizGenerator] Fetching all SBC books...');

            // Query to get distinct book names from the SBC document chunks
            const query = `
                SELECT DISTINCT source_document_name as book,
                       SPLIT_PART(source_document_name, ' - ', 1) as subject
                FROM sbc_document_chunks
                WHERE source_document_name IS NOT NULL
                ORDER BY subject, book;
            `;

            const { rows } = await db.query(query);
            console.log(`[DailyQuizGenerator] Found ${rows.length} books in the SBC`);
            return rows;
        } catch (error) {
            console.error('[DailyQuizGenerator] Error fetching SBC books:', error);
            throw error;
        }
    }

    /**
     * Check if a daily quiz already exists for a book on a specific date
     * @param {string} book - Book name
     * @param {Date} date - Quiz date
     * @returns {Promise<boolean>} True if quiz exists
     */
    async quizExistsForBookAndDate(book, date) {
        try {
            const formattedDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD

            const query = `
                SELECT id FROM daily_quizzes
                WHERE book = $1 AND quiz_date = $2;
            `;

            const { rows } = await db.query(query, [book, formattedDate]);
            return rows.length > 0;
        } catch (error) {
            console.error('[DailyQuizGenerator] Error checking if quiz exists:', error);
            throw error;
        }
    }

    /**
     * Generate a quiz for a specific book using AI
     * @param {Object} bookInfo - Book information {book, subject}
     * @returns {Promise<Object>} Generated quiz
     */
    async generateQuizForBook(bookInfo) {
        try {
            console.log(`[DailyQuizGenerator] Generating quiz for book: ${bookInfo.book}`);

            // Try to use AI service if token is available
            if (this.serviceToken) {
                try {
                    // Call the AI service to generate a quiz
                    const response = await axios.post(
                        `${this.aiServiceUrl}/api/ai/generate/quiz`,
                        {
                            subject: bookInfo.subject,
                            book: bookInfo.book,
                            questionCount: 5, // Generate 5 questions per quiz
                            difficulty: 'mixed', // Mix of easy, medium, and hard questions
                            format: 'multiple_choice' // Use multiple choice format
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${this.serviceToken}`
                            }
                        }
                    );

                    return response.data;
                } catch (aiError) {
                    console.warn(`[DailyQuizGenerator] AI service error for ${bookInfo.book}, using fallback: ${aiError.message}`);
                    // Continue to fallback if AI service fails
                }
            } else {
                console.warn(`[DailyQuizGenerator] Service token not configured. Using fallback quiz generator for ${bookInfo.book}`);
            }

            // Fallback: Generate a template quiz when AI service is unavailable
            return this.generateTemplateQuiz(bookInfo);
        } catch (error) {
            console.error(`[DailyQuizGenerator] Error generating quiz for book ${bookInfo.book}:`, error);
            throw error;
        }
    }

    /**
     * Generate a template quiz when AI service is unavailable
     * @param {Object} bookInfo - Book information {book, subject}
     * @returns {Object} Template quiz
     */
    generateTemplateQuiz(bookInfo) {
        const bookName = bookInfo.book.replace('.pdf', '').replace(/-/g, ' ');
        const subject = bookInfo.subject || 'General Knowledge';

        // Create a title based on the book name
        const title = `Daily Quiz: ${bookName}`;

        // Create a generic description
        const description = `Test your knowledge of ${subject} with this daily quiz about ${bookName}.`;

        // Generate template questions
        const questions = [
            {
                type: 'multiple_choice',
                text: `Which of the following best describes the main focus of ${bookName}?`,
                options: [
                    `Understanding key concepts in ${subject}`,
                    `Practical applications of ${subject}`,
                    `Historical development of ${subject}`,
                    `Advanced techniques in ${subject}`
                ],
                answer: `Understanding key concepts in ${subject}`,
                explanation: `${bookName} primarily focuses on helping students understand the fundamental concepts of ${subject}.`
            },
            {
                type: 'multiple_choice',
                text: `What skills would you likely develop by studying ${bookName}?`,
                options: [
                    `Critical thinking and problem-solving`,
                    `Memorization and recall`,
                    `Creative expression`,
                    `All of the above`
                ],
                answer: `All of the above`,
                explanation: `${bookName} is designed to develop multiple skills including critical thinking, recall of important information, and creative approaches to ${subject}.`
            },
            {
                type: 'multiple_choice',
                text: `Which educational level is ${bookName} primarily designed for?`,
                options: [
                    `Primary school students`,
                    `Junior high school students`,
                    `Senior high school students`,
                    `University students`
                ],
                answer: `Junior high school students`,
                explanation: `Most SBC materials including ${bookName} are designed for junior high school students in Ghana.`
            },
            {
                type: 'multiple_choice',
                text: `What is the best approach to studying the content in ${bookName}?`,
                options: [
                    `Memorize all definitions and facts`,
                    `Practice with examples and exercises`,
                    `Discuss concepts with peers`,
                    `Regular review and application of concepts`
                ],
                answer: `Regular review and application of concepts`,
                explanation: `The most effective way to master the material in ${bookName} is through regular review and practical application of the concepts.`
            },
            {
                type: 'multiple_choice',
                text: `How does ${bookName} relate to the Ghana education curriculum?`,
                options: [
                    `It supplements the curriculum with additional information`,
                    `It is the primary textbook for the curriculum`,
                    `It provides practice exercises only`,
                    `It is not related to the curriculum`
                ],
                answer: `It is the primary textbook for the curriculum`,
                explanation: `${bookName} is part of the School Book Collection (SBC) which provides the primary learning materials for the Ghana education curriculum.`
            }
        ];

        return {
            title,
            topic: subject,
            description,
            questions
        };
    }

    /**
     * Save a generated quiz to the database
     * @param {Object} bookInfo - Information about the book
     * @param {Object} quizData - Generated quiz data
     * @returns {Promise<Object>} Saved quiz
     */
    async saveQuiz(bookInfo, quizData) {
        const client = await db.getClient(); // Use client for transaction
        let savedQuiz = null;
        try {
            await client.query('BEGIN');

            // 1. Insert the quiz
            const quizInsertQuery = `
                INSERT INTO daily_quizzes (subject, book, topic, title, description, quiz_date)
                VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
                RETURNING *;
            `;
            const quizValues = [
                bookInfo.subject || 'General',
                bookInfo.book,
                quizData.topic || 'Daily Review',
                quizData.title || `Daily Quiz: ${bookInfo.book}`,
                quizData.description || `Daily quiz for ${bookInfo.book} to test your knowledge.`
            ];
            const quizResult = await client.query(quizInsertQuery, quizValues);
            savedQuiz = quizResult.rows[0];

            // 2. Insert the questions
            for (const question of quizData.questions) {
                const questionInsertQuery = `
                    INSERT INTO daily_quiz_questions
                    (daily_quiz_id, question_type, question_text, options, correct_answer, explanation)
                    VALUES ($1, $2, $3, $4, $5, $6);
                `;
                const questionValues = [
                    savedQuiz.id,
                    question.question_type || 'multiple_choice',
                    question.question_text,
                    JSON.stringify(question.options || {}),
                    question.correct_answer,
                    question.explanation || null
                ];
                await client.query(questionInsertQuery, questionValues);
            }

            await client.query('COMMIT');
            console.log(`[DailyQuizGenerator] Successfully saved quiz for ${bookInfo.book} with ID ${savedQuiz.id}`);

            // --- Send Notification --- (After successful commit)
            if (this.notificationServiceUrl && this.internalApiKey && savedQuiz) {
                try {
                    const notificationData = {
                        type: 'new_daily_quiz',
                        title: 'New Daily Quiz Available!',
                        message: `A new daily quiz for "${savedQuiz.book}" is ready. Test your knowledge!`, // Generic message for all users
                        relatedEntityType: 'daily_quiz',
                        relatedEntityId: savedQuiz.id
                    };

                    // Send to a specific user group or broadcast (depends on notification service capability)
                    // For now, let's assume we might want to notify *all* students or teachers.
                    // This requires the notification service to handle broadcast/group messages, or we loop through users (less efficient).
                    // Placeholder: Sending to a specific user ID '1' for testing.
                    // In a real scenario, you'd likely trigger this differently, maybe via a separate process
                    // that fetches relevant users (e.g., students enrolled in a course related to the book).
                    // For simplicity, we'll skip sending for now, as broadcasting isn't implemented.
                    console.log(`[DailyQuizGenerator] TODO: Implement notification sending for new daily quiz ID ${savedQuiz.id}.`);
                    /*
                    await axios.post(`${this.notificationServiceUrl}/api/notifications/internal/send`, {
                        // userId: 'broadcast_students', // Or specific user ID
                        userId: 1, // Example: Send to user 1 for testing
                        notificationData: notificationData
                    }, {
                        headers: {
                            'x-internal-api-key': this.internalApiKey
                        }
                    });
                    console.log(`[DailyQuizGenerator] Sent notification for new daily quiz ID ${savedQuiz.id}`);
                    */
                } catch (notificationError) {
                    console.error(`[DailyQuizGenerator] Failed to send notification for new daily quiz ID ${savedQuiz.id}:`, notificationError.message);
                }
            }
            // --- End Send Notification ---

            return savedQuiz;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`[DailyQuizGenerator] Error saving quiz for ${bookInfo.book}:`, error);
            throw error; // Re-throw error after rollback
        } finally {
            client.release();
        }
    }

    /**
     * Generate daily quizzes for all books
     * @returns {Promise<Array>} List of generated quizzes
     */
    async generateDailyQuizzes() {
        try {
            console.log('[DailyQuizGenerator] Starting daily quiz generation...');

            // 1. Get all books
            const books = await this.getAllSbcBooks();

            // 2. Generate quizzes for each book
            const results = [];
            const today = new Date();

            for (const bookInfo of books) {
                try {
                    // Check if quiz already exists for this book today
                    const quizExists = await this.quizExistsForBookAndDate(bookInfo.book, today);

                    if (quizExists) {
                        console.log(`[DailyQuizGenerator] Quiz already exists for ${bookInfo.book} today. Skipping.`);
                        continue;
                    }

                    // Generate and save quiz
                    const quizData = await this.generateQuizForBook(bookInfo);
                    const savedQuiz = await this.saveQuiz(bookInfo, quizData);

                    results.push({
                        book: bookInfo.book,
                        quizId: savedQuiz.id,
                        status: 'success'
                    });
                } catch (error) {
                    console.error(`[DailyQuizGenerator] Failed to generate quiz for ${bookInfo.book}:`, error);

                    results.push({
                        book: bookInfo.book,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            console.log(`[DailyQuizGenerator] Completed daily quiz generation. Results: ${JSON.stringify(results)}`);
            return results;
        } catch (error) {
            console.error('[DailyQuizGenerator] Error in generateDailyQuizzes:', error);
            throw error;
        }
    }
}

module.exports = new DailyQuizGenerator();
