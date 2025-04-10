// services/ai-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const groq = require('./groqClient'); // Import Groq client
const authenticateToken = require('./middleware/authenticateToken');
const requestLogger = require('morgan');
const supabase = require('./supabaseClient'); // Import Supabase client for DB & Storage access
const db = require('./db'); // Import DB connection pool for PostgreSQL
const { getTextFromPdf } = require('./utils/pdfProcessor'); // PDF text extraction utility
const { generateEmbedding } = require('./utils/embeddingProcessor'); // Embedding generation utility

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Routes ---

// Health Check
app.get('/api/ai/health', (req, res) => {
    res.status(200).json({
        status: 'AI Service is Up!',
        groqClientInitialized: !!groq,
        supabaseClientInitialized: !!supabase
    });
});

// --- Endpoint to get list of processed documents ---
// Protected: Any authenticated user can see the list of available books
app.get('/api/ai/processed-documents', authenticateToken, async (req, res) => {
    if (!db) {
        console.error('[AI Service] DB connection pool not available for listing documents.');
        return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' });
    }
    console.log(`[AI Service] Request received to list processed documents by user ${req.user.userId}`);
    try {
        // Using source_document_name as it's more user-friendly for selection
        const query = `
            SELECT DISTINCT source_document_name
            FROM sbc_document_chunks
            WHERE source_document_name IS NOT NULL AND source_document_name != ''
            ORDER BY source_document_name ASC;
        `;
        const { rows } = await db.query(query);
        const documentList = rows.map(row => row.source_document_name);
        console.log(`[AI Service] Found ${documentList.length} distinct processed documents.`);
        res.status(200).json({ documents: documentList });
    } catch (error) {
        console.error('[AI Service] Error fetching list of processed documents:', error);
        res.status(500).json({ error: 'Internal server error fetching document list.' });
    }
});


// --- Document Processing Endpoint ---
app.post('/api/ai/process-document', authenticateToken, async (req, res) => {
    const { bucket, filePath, originalName } = req.body;
    if (!bucket || !filePath) { return res.status(400).json({ error: 'Missing required fields: bucket, filePath' }); }
    if (!supabase) { return res.status(503).json({ error: 'AI Service Unavailable: Supabase client not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] Received request to process document: ${bucket}/${filePath}`);
    try {
        const textContent = await getTextFromPdf(bucket, filePath);
        if (!textContent) { return res.status(500).json({ error: 'Failed to extract text from PDF.' }); }
        console.log(`[AI Service] Extracted ${textContent.length} characters from ${filePath}.`);
        const chunks = textContent.split(/\n\s*\n+/).map(chunk => chunk.trim()).filter(chunk => chunk.length > 50);
        console.log(`[AI Service] Split text into ${chunks.length} potential chunks (min length 50 chars).`);
        if (chunks.length === 0) { return res.status(200).json({ message: 'Document processed, but no text chunks found to embed.' }); }
        let successfulEmbeddings = 0, failedEmbeddings = 0;
        console.log(`[AI Service] Starting embedding generation and storage for ${chunks.length} chunks...`);
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i], chunkLength = chunk.length;
            const embedding = await generateEmbedding(chunk);
            if (embedding && embedding.length === 384) {
                try {
                    const insertQuery = `INSERT INTO sbc_document_chunks (source_document_path, source_document_name, chunk_index, content, content_length, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)`;
                    const embeddingString = `[${embedding.join(',')}]`;
                    const values = [filePath, originalName || null, i, chunk, chunkLength, embeddingString];
                    await db.query(insertQuery, values);
                    successfulEmbeddings++;
                    if ((i + 1) % 20 === 0 || i === chunks.length - 1) { console.log(`[AI Service] Stored chunk ${i + 1}/${chunks.length} for ${filePath}`); }
                } catch (dbError) { console.error(`[AI Service] DB Error storing chunk ${i} for ${filePath}:`, dbError.message); failedEmbeddings++; }
            } else { console.warn(`[AI Service] Failed to generate valid embedding for chunk ${i} of ${filePath}. Skipping.`); failedEmbeddings++; }
        }
        console.log(`[AI Service] Finished processing ${filePath}. Successful embeddings: ${successfulEmbeddings}, Failed: ${failedEmbeddings}`);
        res.status(200).json({ message: `Document processed. Stored ${successfulEmbeddings} embeddings.`, failures: failedEmbeddings });
    } catch (error) { console.error(`[AI Service] Unhandled error processing document ${filePath}:`, error); res.status(500).json({ error: 'Internal server error during document processing.' }); }
});

// --- Basic Ask Endpoint (Uses RAG) ---
app.post('/api/ai/ask', authenticateToken, async (req, res) => {
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') { return res.status(400).json({ error: 'Invalid request: Please provide a non-empty prompt string.' }); }
    console.log(`[AI Service] Received ask request from user ${req.user.userId}: "${prompt}"`);
    let context = "No relevant context found in SBC documents.";
    try {
        console.log("[AI Service] Generating embedding for user prompt...");
        const promptEmbedding = await generateEmbedding(prompt);
        if (promptEmbedding && promptEmbedding.length === 384) {
            const embeddingString = `[${promptEmbedding.join(',')}]`;
            const similarityThreshold = 0.75; const matchCount = 3;
            console.log(`[AI Service] Searching for relevant chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);
            // --- Vector Search Query ---
            // Added filtering by source_document_name if provided in prompt/request later
            const searchQuery = `
                SELECT content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE 1 - (embedding <=> $1::vector) > $2
                ORDER BY similarity DESC
                LIMIT $3
            `;
            const searchValues = [embeddingString, similarityThreshold, matchCount];
            const { rows: searchResults } = await db.query(searchQuery, searchValues);
            if (searchResults && searchResults.length > 0) {
                console.log(`[AI Service] Found ${searchResults.length} relevant chunks.`);
                // Include source document name in context for clarity
                context = searchResults.map((row, index) => `Chunk ${index + 1} (from ${row.source_document_name || 'Unknown Document'}):\n${row.content}`).join("\n\n---\n\n");
                const maxContextLength = 4000;
                if (context.length > maxContextLength) { context = context.substring(0, maxContextLength) + "..."; }
                console.log(`[AI Service] Using combined context (length: ${context.length})`);
            } else { console.log("[AI Service] No relevant chunks found above similarity threshold."); }
        } else { console.warn("[AI Service] Failed to generate embedding for prompt. Cannot perform context search."); }
        // --- Construct Prompt & Call Groq ---
        const systemContent = "You are a helpful AI assistant for Ghanaian educators and students, knowledgeable about the Standards-Based Curriculum (SBC). Use the provided context from relevant SBC document chunks to answer the user's question accurately. If the context doesn't contain the answer, say so clearly and mention which documents were checked if possible.";
        const userContent = `RELEVANT CONTEXT:\n"""\n${context}\n"""\n\nQUESTION: ${prompt}`;
        console.log(`[AI Service] Sending combined context+prompt to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'system', content: systemContent }, { role: 'user', content: userContent } ], model: 'llama3-8b-8192', temperature: 0.5 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq response generated for user ${req.user.userId}.`);
        res.status(200).json({ response: aiResponse });
    } catch (error) {
        // --- Error Handling ---
        console.error('[AI Service] Error during ask request:', error);
        let statusCode = 500; let message = 'Failed to get response from AI model or process request.';
        if (error.status === 401) { message = 'AI Service authentication error. Check Groq API Key.'; }
        else if (error.status === 429) { message = 'AI Service rate limit hit. Please try again later.'; statusCode = 429; }
        else if (error.message?.includes('maximum context length')) { message = 'The retrieved context or question is too long for the AI model.'; statusCode = 400; }
        else if (error.code === 'ECONNREFUSED') { message = 'Database connection refused. Check DB service.'; statusCode = 503; }
        res.status(statusCode).json({ error: message });
    }
});


// --- Endpoint for Lesson Plan Generation ---
app.post('/api/ai/generate/lesson-plan', authenticateToken, async (req, res) => {
    const { subject, classLevel, topic, duration, strand, subStrand, contentStandard } = req.body;
    if (!subject || !classLevel || !topic || !duration || !strand || !subStrand || !contentStandard) { return res.status(400).json({ error: 'Missing required fields for lesson plan generation.' }); }
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] Lesson Plan request received from user ${req.user.userId} for Topic: ${topic}`);
    let context = "No specific context found in SBC documents for this topic/strand.";
    try {
        const searchQueryText = `Lesson plan for ${subject}, ${classLevel}. Topic: ${topic}. Strand: ${strand}. Sub-strand: ${subStrand}. Content Standard: ${contentStandard}`;
        console.log(`[AI Service] Generating embedding for search query: "${searchQueryText.substring(0,100)}..."`);
        const queryEmbedding = await generateEmbedding(searchQueryText);
        if (queryEmbedding && queryEmbedding.length === 384) {
            const embeddingString = `[${queryEmbedding.join(',')}]`; const similarityThreshold = 0.70; const matchCount = 5;
            console.log(`[AI Service] Searching for relevant SBC chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);
            // --- Vector Search Query ---
            const searchQuery = `
                SELECT content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE 1 - (embedding <=> $1::vector) > $2
                ORDER BY similarity DESC
                LIMIT $3
            `;
            const searchValues = [embeddingString, similarityThreshold, matchCount];
            const { rows: searchResults } = await db.query(searchQuery, searchValues);
            if (searchResults && searchResults.length > 0) {
                console.log(`[AI Service] Found ${searchResults.length} relevant chunks for lesson plan.`);
                context = searchResults.map((row, index) => `Relevant Chunk ${index + 1} (from ${row.source_document_name || 'Unknown Document'}):\n${row.content}`).join("\n\n---\n\n");
                const maxContextLength = 6000;
                if (context.length > maxContextLength) { context = context.substring(0, maxContextLength) + "..."; }
                console.log(`[AI Service] Using combined context (length: ${context.length}) for lesson plan.`);
            } else { console.log("[AI Service] No relevant SBC chunks found above similarity threshold for lesson plan."); }
        } else { console.warn("[AI Service] Failed to generate embedding for lesson plan search query. Proceeding without specific context."); }
        // --- Construct Prompt & Call Groq ---
        const lessonPlanPrompt = `
Generate a detailed lesson plan strictly following the format below. Use the provided SBC context to inform the content where relevant. If context is missing for a specific section, generate appropriate educational content based on the topic and level.

**SBC Context Provided:**
"""
${context}
"""

**Lesson Plan Request Details:**
*   Subject: ${subject}
*   Class Level: ${classLevel}
*   Topic: ${topic}
*   Duration: ${duration}
*   Strand: ${strand}
*   Sub-strand: ${subStrand}
*   Content Standard: ${contentStandard}

**Required Lesson Plan Format:**

1.  **Subject:** ${subject}
2.  **Class Level:** ${classLevel}
3.  **Week & Lesson Number:** (Generate placeholder like Week X, Lesson Y)
4.  **Duration:** ${duration}
5.  **Strand:** ${strand}
6.  **Sub-strand:** ${subStrand}
7.  **Content Standard:** ${contentStandard}
8.  **Core Competencies:** (Identify relevant competencies based on topic/context, e.g., Critical Thinking, Communication, Collaboration, Creativity, Digital Literacy, Personal Development and List the core competencies that the lesson aims to develop)
9.  **Indicators & Exemplars:** (Derive specific, measurable indicators and examples from the content standard and context and Provide specific indicators and exemplars to guide the lesson's objectives.)
10. **Three Essential Questions:** (Formulate 3 thought-provoking questions related to the topic and indicators  that drive the lesson's inquiry. These questions should promote critical thinking and deeper and Detail the pedagogical strategies to be employed, ensuring they are aligned with best practices. Explain why these strategies are suitable for the lesson's objectives and the target student group. Examples include: group work, discussions, presentations, demonstrations, project-based learning, and inquiry-based learning. Specify how each strategy will be implemented.)
11. **Pedagogical Strategies:** (Detail specific strategies like Group Work, Inquiry-Based Learning, Demonstration, etc. Explain *why* they are suitable and *how* they will be implemented for this topic/level)
12. **Lesson Phases:**
    *   **Starter Activity (5-10 minutes):** (Describe a specific, engaging activity with purpose and connection to objectives)
    *   **Main Activity (25-30 minutes):** (Outline step-by-step core activities, detailing teacher and student roles, interactions, and collaboration)
    *   **Reflection (5-10 minutes):** (Describe a specific reflection method - summary, Q&A, sharing - connecting to prior knowledge)
    *   **Assessment in DOK levels (1,2,3,4):** (Provide specific example questions/tasks for EACH DOK level 1-4, including objective questions. Ensure variety and alignment with indicators)
13. **Teaching & Learning Resources:** (List specific resources needed - textbooks [placeholders if unknown], worksheets, specific online tools/links, materials, quantities)
14. **Lesson Keywords:** (Identify 3-5 key terms relevant to the lesson and provide clear definitions)
15. **Assessment & Homework:** (Provide clear instructions for the main assessment aligned with indicators. Describe a meaningful, relevant homework task with evaluation criteria)

**Instructions:**
*   Adhere strictly to the numbered format.
*   Ensure all sections are filled with detailed, specific, relevant information.
*   Base content on provided SBC context.
*   Generate realistic, pedagogically sound activities/assessments for the class level.
*   Avoid vague descriptions. Be specific.
*   Do not omit sections.
`;
        console.log(`[AI Service] Sending lesson plan request to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'user', content: lessonPlanPrompt } ], model: 'llama3-70b-8192', temperature: 0.6 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq lesson plan generated for user ${req.user.userId}.`);
        res.status(200).json({ lessonPlan: aiResponse });
    } catch (error) {
        // --- Error Handling ---
        console.error('[AI Service] Error during lesson plan generation:', error);
        let statusCode = 500; let message = 'Failed to generate lesson plan.';
        if (error.status === 401) { message = 'AI Service authentication error. Check Groq API Key.'; }
        else if (error.status === 429) { message = 'AI Service rate limit hit. Please try again later.'; statusCode = 429; }
        else if (error.message?.includes('maximum context length')) { message = 'The retrieved context or request details are too long for the AI model.'; statusCode = 400; }
        else if (error.code === 'ECONNREFUSED') { message = 'Database connection refused. Check DB service.'; statusCode = 503; }
        res.status(statusCode).json({ error: message });
    }
});

// --- Endpoint for Assessment Generation ---
app.post('/api/ai/generate/assessment', authenticateToken, async (req, res) => {
    const { subject, classLevel, topic, assessmentType, dokLevels, numQuestions, contentStandard } = req.body;
    if (!subject || !classLevel || !topic || !assessmentType || !dokLevels || !Array.isArray(dokLevels) || dokLevels.length === 0 || !numQuestions || !contentStandard) { return res.status(400).json({ error: 'Missing required fields, or dokLevels is not a non-empty array.' }); }
    if (!dokLevels.every(level => typeof level === 'number' && level >= 1 && level <= 4)) { return res.status(400).json({ error: 'Invalid DoK Level(s) provided. Each must be a number between 1-4.' }); }
    const count = parseInt(numQuestions);
    if (isNaN(count) || count < 1 || count > 20) { return res.status(400).json({ error: 'Invalid number of questions. Must be between 1 and 20.' }); }
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] Assessment request received from user ${req.user.userId} for Topic: ${topic}`);
    let context = "No specific context found in SBC documents for this topic/standard.";
    try {
        const dokLevelsString = dokLevels.join(', ');
        const searchQueryText = `Assessment for ${subject}, ${classLevel}. Topic: ${topic}. Assessment Type: ${assessmentType}. DoK Levels: ${dokLevelsString}. Content Standard: ${contentStandard}`;
        console.log(`[AI Service] Generating embedding for assessment search query: "${searchQueryText.substring(0,100)}..."`);
        const queryEmbedding = await generateEmbedding(searchQueryText);
        if (queryEmbedding && queryEmbedding.length === 384) {
            const embeddingString = `[${queryEmbedding.join(',')}]`; const similarityThreshold = 0.70; const matchCount = 4;
            console.log(`[AI Service] Searching for relevant SBC chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);
            // --- Vector Search Query ---
            const searchQuery = `
                SELECT content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE 1 - (embedding <=> $1::vector) > $2
                ORDER BY similarity DESC
                LIMIT $3
            `;
            const searchValues = [embeddingString, similarityThreshold, matchCount];
            const { rows: searchResults } = await db.query(searchQuery, searchValues);
            if (searchResults && searchResults.length > 0) {
                console.log(`[AI Service] Found ${searchResults.length} relevant chunks for assessment.`);
                context = searchResults.map((row, index) => `Relevant Chunk ${index + 1} (from ${row.source_document_name || 'Unknown Document'}):\n${row.content}`).join("\n\n---\n\n");
                const maxContextLength = 5000;
                if (context.length > maxContextLength) { context = context.substring(0, maxContextLength) + "..."; }
                console.log(`[AI Service] Using combined context (length: ${context.length}) for assessment.`);
            } else { console.log("[AI Service] No relevant SBC chunks found above similarity threshold for assessment."); }
        } else { console.warn("[AI Service] Failed to generate embedding for assessment search query. Proceeding without specific context."); }
        // --- Construct Prompt & Call Groq ---
        const assessmentPrompt = `
Generate ${count} assessment questions/tasks strictly adhering to the specifications below, covering the specified Depth of Knowledge (DoK) levels. Use the provided SBC context where relevant.

**SBC Context Provided:**
"""
${context}
"""

**Assessment Request Details:**
*   Subject: ${subject}
*   Class Level: ${classLevel}
*   Topic: ${topic}
*   Content Standard: ${contentStandard}
*   Assessment Type: ${assessmentType}
*   Depth of Knowledge (DoK) Level(s): ${dokLevelsString}
*   Number of Questions/Tasks: ${count}

**Instructions:**
*   Generate exactly ${count} distinct questions or task descriptions.
*   Distribute the questions/tasks across the specified DoK Level(s): ${dokLevelsString}. Aim for a mix if multiple levels are selected. Clearly label the intended DoK level for each question/task (e.g., "[DoK 2]").
*   Ensure questions/tasks directly assess understanding of the Topic and Content Standard.
*   Base questions on the provided SBC Context if possible.
*   **For Multiple Choice:** Provide the question stem on its own line. List each option (A, B, C, D) on its own separate line. Clearly indicate the correct answer on its own separate line below the options.
*   **For Short Answer/Essay:** Provide a clear, concise question or prompt. Do not mix question types unless specifically asked.
*   **For Project Task/Practical:** Provide a clear description of the task, expected output, and materials needed.
*   **Rubric Generation:** After generating the questions/tasks, generate a full, detailed grading rubric relevant to the Assessment Type and the *highest* DoK level requested. The rubric should include specific criteria, performance level descriptors (e.g., Excellent, Good, Fair, Poor), and point allocations that sum up appropriately (e.g., if the task is worth 20 points).
*   Format the output clearly, numbering each question/task, ensuring necessary line breaks, and presenting the rubric clearly after the questions.

**Example Output Format (Multiple Choice):**

1.  [DoK X] [Question Stem]?
    A) [Option A]
    B) [Option B]
    C) [Option C]
    D) [Option D]
    **Correct Answer:** [Letter]

**Example Output Format (Short Answer):**

1.  [DoK X] [Question Prompt]

**Example Output Format (Project Task):**

1.  [DoK X] **Task:** [Description]
    **Expected Output:** [Description]
    **Materials:** [List]

**(Separate Section After Questions)**
**Grading Rubric:**
| Criteria | Excellent (X pts) | Good (Y pts) | Fair (Z pts) | Poor (W pts) |
| :------- | :---------------- | :----------- | :----------- | :----------- |
| [Crit 1] | [Desc]            | [Desc]       | [Desc]       | [Desc]       |
| [Crit 2] | [Desc]            | [Desc]       | [Desc]       | [Desc]       |
| **Total**|                   |              |              | **[Max Pts]**|

`;
        console.log(`[AI Service] Sending assessment request to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'user', content: assessmentPrompt } ], model: 'llama3-70b-8192', temperature: 0.6 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq assessment generated for user ${req.user.userId}.`);
        res.status(200).json({ assessment: aiResponse });
    } catch (error) {
        // --- Error Handling ---
        console.error('[AI Service] Error during assessment generation:', error);
        let statusCode = 500; let message = 'Failed to generate assessment.';
        if (error.status === 401) { message = 'AI Service authentication error. Check Groq API Key.'; }
        else if (error.status === 429) { message = 'AI Service rate limit hit. Please try again later.'; statusCode = 429; }
        else if (error.message?.includes('maximum context length')) { message = 'The retrieved context or request details are too long for the AI model.'; statusCode = 400; }
        else if (error.code === 'ECONNREFUSED') { message = 'Database connection refused. Check DB service.'; statusCode = 503; }
        res.status(statusCode).json({ error: message });
    }
});


// --- Endpoint for Table of Specification (ToS) Generation ---
app.post('/api/ai/generate/tos', authenticateToken, async (req, res) => {
    const { subject, book, assessmentTitle, coveredTopics, objectiveWeight, subjectiveWeight } = req.body; // Use book
    if (!subject || !book || !assessmentTitle) { return res.status(400).json({ error: 'Missing required fields: subject, book, assessmentTitle.' }); }
    if (coveredTopics && (!Array.isArray(coveredTopics))) { return res.status(400).json({ error: 'coveredTopics must be an array if provided.' }); }
    const topicsArray = coveredTopics || [];
    const objWeight = objectiveWeight !== undefined ? parseInt(objectiveWeight) : 50;
    const subjWeight = subjectiveWeight !== undefined ? parseInt(subjectiveWeight) : 50;
    // ... (weight validation/warning) ...
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] ToS request received from user ${req.user.userId} for Subject: ${subject}, Book: ${book}`);
    let context = "No specific context found in SBC documents for this book/subject.";
    try {
        const topicsString = topicsArray.length > 0 ? `Specific Topics: ${topicsArray.join(', ')}` : `All topics for ${book}`;
        const searchQueryText = `Table of Specifications for ${subject}, ${book}. ${topicsString}. Assessment: ${assessmentTitle}`; // Use book
        console.log(`[AI Service] Generating embedding for ToS search query: "${searchQueryText.substring(0,100)}..."`);
        const queryEmbedding = await generateEmbedding(searchQueryText);
        if (queryEmbedding && queryEmbedding.length === 384) {
            const embeddingString = `[${queryEmbedding.join(',')}]`; const similarityThreshold = 0.50; const matchCount = 4;
            console.log(`[AI Service] Searching for relevant SBC chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);
             // --- Vector Search Query ---
             // Filter context search by the selected book name
            const searchQuery = `
                SELECT content, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE source_document_name = $4 -- Filter by book name
                  AND 1 - (embedding <=> $1::vector) > $2
                ORDER BY similarity DESC
                LIMIT $3
            `;
            const searchValues = [embeddingString, similarityThreshold, matchCount, book]; // Add book to query values
            const { rows: searchResults } = await db.query(searchQuery, searchValues);
            if (searchResults && searchResults.length > 0) {
                console.log(`[AI Service] Found ${searchResults.length} relevant chunks for ToS (Book: ${book}).`);
                context = searchResults.map((row, index) => `Relevant Chunk ${index + 1}:\n${row.content}`).join("\n\n---\n\n");
                const maxContextLength = 4000;
                if (context.length > maxContextLength) { context = context.substring(0, maxContextLength) + "..."; }
                console.log(`[AI Service] Using combined context (length: ${context.length}) for ToS.`);
            } else { console.log(`[AI Service] No relevant SBC chunks found above similarity threshold for ToS (Book: ${book}).`); }
        } else { console.warn("[AI Service] Failed to generate embedding for ToS search query. Proceeding without specific context."); }
        // --- Construct Prompt & Call Groq ---
        const topicsInstruction = topicsArray.length > 0 ? `Focus specifically on these Topics/Strands Covered: ${topicsArray.join(', ')}` : `Cover all relevant topics/strands typically found in ${subject} ${book} (e.g., Weeks 1-12 for a semester). Use the provided context to determine these topics if possible.`;
        const tosPrompt = `
Generate a comprehensive Table of Specifications (ToS) / Assessment Blueprint based on the details below. The output MUST strictly follow the multi-part structure shown in the example, including Paper 1 (Multiple Choice Table), Paper 2 (Essay Table), Paper 3 (Practical Table), Detailed Content Coverage, and Assessment Distribution sections. Use the provided SBC context if relevant, otherwise generate based on standard educational practice for the subject and book level.

**SBC Context Provided:**
"""
${context}
"""

**Table of Specification Request Details:**
*   Subject: ${subject}
*   Book / Level: ${book}
*   Assessment Title: ${assessmentTitle}
*   Topics Instruction: ${topicsInstruction}
*   Desired Weighting (Approximate): Objective Questions ${objWeight}%, Subjective Questions ${subjWeight}%

**Required Output Structure:**

**TABLE OF SPECIFICATION FOR ${subject.toUpperCase()}**
${book}, ${assessmentTitle}

**PAPER 1: MULTIPLE CHOICE QUESTIONS (Suggest total marks, e.g., 40 marks)**
*(Create a Markdown table with columns: Week/Topic Area, DOK Level 1 (Recall), DOK Level 2 (Skills/Concepts), DOK Level 3 (Strategic Thinking), DOK Level 4 (Extended Thinking), Total Qns per Topic. Distribute a reasonable number of multiple-choice questions (e.g., 30-40 total) across the relevant topics/weeks for ${book}. Focus DoK 1-3...)*
| Week/Topic Area | DOK 1 | DOK 2 | DOK 3 | DOK 4 | Total Qns |
| :-------------- | :---- | :---- | :---- | :---- | :-------- |
| [Topic/Week 1]  | ...   |       |       |       |           |
| ...             |       |       |       |       |           |
| **TOTAL**       |       |       |       |       |           |

**PAPER 2: ESSAY QUESTIONS (Suggest total marks/structure...)**
*(Create a Markdown table... Distribute essay questions across broader topic areas covering the scope of ${book}. Focus DoK 3-4...)*
| Week Range/Topic Area | DOK 1 | DOK 2 | DOK 3 | DOK 4 | Total Qns |
| :-------------------- | :---- | :---- | :---- | :---- | :-------- |
| [Topic Area 1]        | ...   |       |       |       |           |
| **TOTAL**             |       |       |       |       |           |

**PAPER 3: PRACTICAL ASSESSMENT (Suggest total marks/structure...)**
*(Create a Markdown table... Distribute 1 or 2 practical tasks relevant to ${book}. Focus DoK 4...)*
| Week Range/Topic Area | DOK 1 | DOK 2 | DOK 3 | DOK 4 | Total Qns |
| :-------------------- | :---- | :---- | :---- | :---- | :-------- |
| [Practical Task Area 1]| ...   |       |       |       |           |
| **TOTAL**             |       |       |       |       |           |

**DETAILED CONTENT COVERAGE**
*(Based on the selected ${book} and the provided context [and specific topics if given], list the specific Strands, Sub-strands, and key concepts expected.)*
STRAND X: ...
Sub-strand X.Y: ...
 - ...

**ASSESSMENT DISTRIBUTION**
*(Summarize the overall weighting/marks for each paper...)*
PAPER 1: ...
PAPER 2: ...
PAPER 3: ...

**Instructions for AI:**
*   Strictly adhere to the requested multi-part structure and Markdown formatting.
*   If specific topics were provided, focus on those. If not, cover the typical scope for ${book}.
*   Fill in reasonable numbers of questions. Ensure DoK distributions align with paper type.
*   Derive content coverage details accurately. Calculate final distribution.
*   Output *only* the requested sections in the specified order. Do not add extra conversational text.
`;
        console.log(`[AI Service] Sending DETAILED ToS request to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'user', content: tosPrompt } ], model: 'llama3-70b-8192', temperature: 0.3 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq DETAILED ToS generated for user ${req.user.userId}.`);
        res.status(200).json({ tableOfSpecification: aiResponse });
    } catch (error) {
        console.error('[AI Service] Error during ToS generation:', error);
        let statusCode = 500; let message = 'Failed to generate Table of Specifications.';
        if (error.status === 401) { message = 'AI Service authentication error. Check Groq API Key.'; }
        else if (error.status === 429) { message = 'AI Service rate limit hit. Please try again later.'; statusCode = 429; }
        else if (error.message?.includes('maximum context length')) { message = 'The retrieved context or request details are too long for the AI model.'; statusCode = 400; }
        else if (error.code === 'ECONNREFUSED') { message = 'Database connection refused. Check DB service.'; statusCode = 503; }
        res.status(statusCode).json({ error: message });
    }
});


// --- Endpoint for Rubric Generation ---
app.post('/api/ai/generate/rubric', authenticateToken, async (req, res) => {
    const { assessmentTitle, assessmentType, classLevel, taskDescription, maxScore } = req.body;
    if (!assessmentTitle || !assessmentType || !classLevel || !taskDescription) { return res.status(400).json({ error: 'Missing required fields: assessmentTitle, assessmentType, classLevel, taskDescription.' }); }
    const score = maxScore ? parseInt(maxScore) : 100;
    if (isNaN(score) || score <= 0) { return res.status(400).json({ error: 'Invalid Max Score. Must be a positive number.' }); }
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    console.log(`[AI Service] Rubric request received from user ${req.user.userId} for Assessment: ${assessmentTitle}`);
    const context = "N/A for this generator."; // No RAG needed for rubric based on description
    try {
        const rubricPrompt = `
Generate a detailed grading rubric suitable for the assessment described below. The output should be a well-formatted Markdown table.

**Assessment Details:**
*   Assessment Title: ${assessmentTitle}
*   Assessment Type: ${assessmentType}
*   Class Level: ${classLevel}
*   Task Description / Prompt Given to Students:
    """
    ${taskDescription}
    """
*   Maximum Score: ${score}

**Instructions:**
*   Create a Markdown table for the rubric.
*   Identify 3-5 relevant and clear assessment criteria.
*   Define 3-4 performance levels (e.g., Excellent, Good, Fair, Poor).
*   For each criterion, write specific, observable descriptors for each performance level.
*   Allocate points for each criterion, ensuring the total sums up to ${score}.
*   The table should have 'Criteria' as the first column header, followed by columns for each performance level (including points).

**Example Markdown Table Structure:**

| Criteria                 | Excellent (X pts)          | Good (Y pts)             | Fair (Z pts)               | Poor (W pts)             |
| :----------------------- | :------------------------- | :----------------------- | :------------------------- | :----------------------- |
| **Criterion 1 Name**     | Descriptor...              | Descriptor...            | Descriptor...              | Descriptor...            |
| **Total Points Possible**|                            |                          |                            | **${score}**             |

**Final Output:**
Present *only* the final Markdown table.
`;
        console.log(`[AI Service] Sending rubric request to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'user', content: rubricPrompt } ], model: 'llama3-70b-8192', temperature: 0.5 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq rubric generated for user ${req.user.userId}.`);
        res.status(200).json({ rubric: aiResponse });
    } catch (error) {
        console.error('[AI Service] Error during rubric generation:', error);
        let statusCode = 500; let message = 'Failed to generate rubric.';
        if (error.status === 401) { message = 'AI Service authentication error. Check Groq API Key.'; }
        else if (error.status === 429) { message = 'AI Service rate limit hit. Please try again later.'; statusCode = 429; }
        else if (error.message?.includes('maximum context length')) { message = 'The request details are too long for the AI model.'; statusCode = 400; }
        res.status(statusCode).json({ error: message });
    }
});
app.get('/api/content/student-material', authenticateToken, async (req, res) => {
    // --- Input Validation ---
    const { subject, grade, topic } = req.query; // Get params from query string
    const userId = req.user.userId; // User requesting

    if (!subject || !grade) {
        return res.status(400).json({ error: 'Missing required query parameters: subject, grade.' });
    }

    // --- Auth & DB Check ---
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] Student material request received from user ${userId} for Subject: ${subject}, Grade: ${grade}, Topic: ${topic || 'any'}`);

    try {
        // --- Perform Vector Search ---
        // Construct search query based on available parameters
        let searchQueryText = `SBC Content for ${grade} ${subject}.`;
        if (topic) {
            searchQueryText += ` Topic: ${topic}`;
        }
        console.log(`[AI Service] Generating embedding for student content search: "${searchQueryText.substring(0,100)}..."`);
        const queryEmbedding = await generateEmbedding(searchQueryText);

        if (!queryEmbedding || queryEmbedding.length !== 384) {
             console.warn("[AI Service] Failed to generate embedding for student content search.");
             // Return empty list or perhaps fetch based on keywords if embedding fails?
             return res.status(200).json({ chunks: [] }); // Return empty for now
        }

        const embeddingString = `[${queryEmbedding.join(',')}]`;
        const similarityThreshold = 0.72; // Adjust threshold for relevance
        const matchCount = 10; // Retrieve a decent number of chunks for a topic/subject area

        console.log(`[AI Service] Searching for relevant student content chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);

        // TODO: Add filtering based on metadata if available (e.g., WHERE grade_level = $4 AND subject = $5)
        // For now, search all chunks based purely on semantic similarity
        const searchQuery = `
            SELECT id, content, source_document_name, chunk_index, 1 - (embedding <=> $1::vector) AS similarity
            FROM sbc_document_chunks
            WHERE 1 - (embedding <=> $1::vector) > $2
            ORDER BY similarity DESC
            LIMIT $3
        `;
        const searchValues = [embeddingString, similarityThreshold, matchCount];

        const { rows: searchResults } = await db.query(searchQuery, searchValues);

        if (searchResults && searchResults.length > 0) {
            console.log(`[AI Service] Found ${searchResults.length} relevant chunks for student.`);
            // Return the chunks, potentially sorted by chunk_index if needed later
            res.status(200).json({ chunks: searchResults });
        } else {
            console.log("[AI Service] No relevant chunks found for student query.");
            res.status(200).json({ chunks: [] }); // Return empty array if no matches
        }

    } catch (error) {
        console.error('[AI Service] Error fetching student material:', error);
        res.status(500).json({ error: 'Internal server error fetching student material.' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`AI Service running on port ${PORT}`);
});