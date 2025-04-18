// services/ai-service/routes/quizGenerator.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');

// --- Generate Quiz ---
// POST /api/ai/generate/quiz
router.post('/quiz', async (req, res) => {
    const { subject, book, topic, questionCount, difficulty, format } = req.body;

    // Validate required fields
    if (!subject || !book) {
        return res.status(400).json({ error: 'Missing required fields: subject, book' });
    }

    // Set defaults for optional fields
    const count = parseInt(questionCount) || 5;
    const quizDifficulty = difficulty || 'mixed';
    const questionFormat = format || 'multiple_choice';

    // Validate count
    if (isNaN(count) || count < 1 || count > 10) {
        return res.status(400).json({ error: 'Question count must be between 1 and 10' });
    }

    // Check if Groq client is available
    if (!groq) {
        return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' });
    }

    console.log(`[AI Service] Quiz generation request received for Subject: ${subject}, Book: ${book}`);

    try {
        // Determine user role for content filtering
        const userRole = req.user?.role || 'student';
        const allowedAudiences = userRole === 'teacher' || userRole === 'admin'
            ? ['all', 'teacher']
            : ['all', 'student'];

        // Prepare search query for relevant content
        const searchQueryText = `Quiz about ${subject}, ${book}${topic ? `, focusing on ${topic}` : ''}`;
        console.log(`[AI Service] Generating embedding for quiz search query: "${searchQueryText.substring(0,100)}..."`);

        // Generate embedding for semantic search
        const queryEmbedding = await generateEmbedding(searchQueryText);

        let context = "No specific context found in SBC documents for this book.";
        let sbcResultsFound = false;

        if (queryEmbedding && queryEmbedding.length === 384) {
            const embeddingString = `[${queryEmbedding.join(',')}]`;
            const similarityThreshold = 0.70;
            const matchCount = 5;

            console.log(`[AI Service] Searching for relevant SBC chunks for quiz (threshold: ${similarityThreshold}, count: ${matchCount})...`);

            // Vector search query
            const searchQuery = `
                SELECT content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE source_document_name = $4 -- Filter by book name
                  AND 1 - (embedding <=> $1::vector) > $2
                  AND audience_type = ANY($5) -- Filter by allowed audience types
                ORDER BY similarity DESC
                LIMIT $3
            `;

            const searchValues = [embeddingString, similarityThreshold, matchCount, book, allowedAudiences];
            const { rows: searchResults } = await db.query(searchQuery, searchValues);

            if (searchResults && searchResults.length > 0) {
                sbcResultsFound = true;
                context = searchResults.map((row, index) =>
                    `Chunk ${index + 1} (from ${row.source_document_name || 'SBC Doc'}):\n${row.content}`
                ).join("\n\n---\n\n");

                // Limit context length
                const maxContextLength = 4000;
                if (context.length > maxContextLength) {
                    context = context.substring(0, maxContextLength) + "...";
                }

                console.log(`[AI Service] Using combined context (length: ${context.length}) for quiz.`);
            } else {
                console.log("[AI Service] No relevant SBC chunks found above similarity threshold for quiz.");
            }
        } else {
            console.warn("[AI Service] Failed to generate embedding for quiz search query. Proceeding without specific context.");
        }

        // Construct prompt for quiz generation
        const quizPrompt = `
Generate a quiz with ${count} questions about the book "${book}" for the subject "${subject}"${topic ? ` focusing on the topic "${topic}"` : ''}.
The quiz should be at a ${quizDifficulty} difficulty level and use the ${questionFormat} format.

Use the following content from the book as context for creating relevant questions:
${context}

Return the quiz in the following JSON format:
{
  "title": "Quiz title",
  "topic": "Specific topic covered",
  "description": "Brief description of what the quiz covers",
  "questions": [
    {
      "type": "multiple_choice",
      "text": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Correct option text",
      "explanation": "Explanation of the correct answer"
    },
    ...more questions...
  ]
}

Make sure:
1. Questions are directly related to the content in the book
2. Each question has exactly one correct answer
3. For multiple choice questions, provide 4 options
4. The explanation clearly explains why the answer is correct
5. The difficulty is appropriate for students studying this book
6. Questions test understanding, not just memorization
7. The JSON is valid and properly formatted
`;

        console.log(`[AI Service] Sending quiz generation request to Groq for user ${req.user?.userId || 'unknown'}.`);

        // Call Groq API to generate the quiz
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: quizPrompt }],
            model: 'llama3-70b-8192',
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq quiz generated for user ${req.user?.userId || 'unknown'}.`);

        // Parse the JSON response
        try {
            const quizData = JSON.parse(aiResponse);
            res.status(200).json(quizData);
        } catch (parseError) {
            console.error('[AI Service] Error parsing quiz JSON response:', parseError);
            res.status(500).json({
                error: 'Failed to parse quiz data from AI response.',
                rawResponse: aiResponse
            });
        }
    } catch (error) {
        console.error('[AI Service] Error during quiz generation:', error);

        let statusCode = 500;
        let message = 'Failed to generate quiz.';

        if (error.status === 401) {
            message = 'AI Service authentication error. Check Groq API Key.';
        }

        res.status(statusCode).json({ error: message });
    }
});

module.exports = router;
