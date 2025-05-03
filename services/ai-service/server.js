// services/ai-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http'); // <-- Import Node's http module
const { Server } = require("socket.io"); // <-- Import Socket.IO Server
const groq = require('./groqClient'); // Import Groq client
const tavilyClient = require('./tavilyClient'); // Import Tavily client
const authenticateToken = require('./middleware/authenticateToken');
const checkUsageLimit = require('./middleware/checkUsageLimit');
const usageLimitService = require('./services/usageLimitService');
const requestLogger = require('morgan');
const supabase = require('./supabaseClient'); // Import Supabase client for DB & Storage access
const db = require('./db'); // Import DB connection pool for PostgreSQL
const { getTextFromPdf } = require('./utils/pdfProcessor'); // PDF text extraction utility
const { generateEmbedding } = require('./utils/embeddingProcessor'); // Embedding generation utility

const app = express();
const server = http.createServer(app); // <-- Create HTTP server from Express app

// --- Configure Socket.IO ---
const io = new Server(server, {
    cors: {
        // Allow requests from your frontend development server and deployed Vercel URL
        // Replace 'https://learnbridge-eight.vercel.app' with your actual Vercel URL
        origin: [
            "http://localhost:3000", // Your local frontend dev server
            "https://learnbridge-eight.vercel.app" // Your deployed frontend
            // Add your custom domain later if needed: "https://app.learnbridgeedu.com"
        ],
        methods: ["GET", "POST"],
        credentials: true // If you need to handle cookies or auth headers via socket later
    }
});

const PORT = process.env.PORT || 3004;

// Middleware (for Express routes)
app.use(cors()); // Keep CORS for regular HTTP routes too
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
    console.log(`[Socket.IO] User connected: ${socket.id}`);

    // Send a welcome message to the newly connected client
    socket.emit('welcome', { message: `Welcome! You are connected with ID: ${socket.id}` });

    // Example: Listen for a message from the client
    socket.on('clientPing', (data) => {
        console.log(`[Socket.IO] Received clientPing from ${socket.id}:`, data);
        // Send a pong back to the specific client
        socket.emit('serverPong', { message: 'Pong from server!', timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`[Socket.IO] User disconnected: ${socket.id}. Reason: ${reason}`);
    });

    // Handle connection errors for this specific socket
     socket.on('error', (err) => {
        console.error(`[Socket.IO] Socket error for ${socket.id}:`, err);
     });
});

// --- Existing HTTP Routes ---

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
    // --- Receive audienceType ---
    const { bucket, filePath, originalName, audienceType } = req.body;
    const validAudienceTypes = ['teacher', 'student', 'all'];
    const finalAudienceType = validAudienceTypes.includes(audienceType) ? audienceType : 'all'; // Default/Validate

    if (!bucket || !filePath) { return res.status(400).json({ error: 'Missing required fields: bucket, filePath' }); }
    if (!supabase) { return res.status(503).json({ error: 'AI Service Unavailable: Supabase client not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }

    console.log(`[AI Service] Received request to process document: ${bucket}/${filePath} for Audience: ${finalAudienceType}`);
    try {
        const textContent = await getTextFromPdf(bucket, filePath);
        if (!textContent) { return res.status(500).json({ error: 'Failed to extract text from PDF.' }); }
        console.log(`[AI Service] Extracted ${textContent.length} characters from ${filePath}.`);
        const chunks = textContent.split(/\n\s*\n+/).map(chunk => chunk.trim()).filter(chunk => chunk.length > 50);
        console.log(`[AI Service] Split text into ${chunks.length} potential chunks (min length 50 chars).`);
        if (chunks.length === 0) { return res.status(200).json({ message: 'Document processed, but no text chunks found to embed.' }); }
        let successfulEmbeddings = 0, failedEmbeddings = 0;
        console.log(`[AI Service] Starting embedding generation and storage for ${chunks.length} chunks (Audience: ${finalAudienceType})...`);
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i], chunkLength = chunk.length;
            const embedding = await generateEmbedding(chunk);
            if (embedding && embedding.length === 384) {
                try {
                    // --- Add audience_type to INSERT ---
                    const insertQuery = `
                        INSERT INTO sbc_document_chunks
                        (source_document_path, source_document_name, chunk_index, content, content_length, embedding, audience_type, user_id)
                        VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8) -- Added user_id
                    `;
                    const embeddingString = `[${embedding.join(',')}]`;
                    // --- Add finalAudienceType to values array ---
                    const values = [
                        filePath,
                        originalName || null,
                        i,
                        chunk,
                        chunkLength,
                        embeddingString,
                        finalAudienceType, // <-- Pass audience type here
                        req.user.userId // Store who initiated the processing via upload
                    ];

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
app.post('/api/ai/ask', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.AI_ASSISTANT), async (req, res) => {
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    const { prompt, includeThinking = false } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') { return res.status(400).json({ error: 'Invalid request: Please provide a non-empty prompt string.' }); }

    const userRole = req.user.role; // Get role from token payload
    const userId = req.user.userId;
    console.log(`[AI Service] Received ask request from user ${userId} (Role: ${userRole}): "${prompt}"`);

    let sbcContext = ""; // Initialize as empty string
    let webContext = ""; // Initialize as empty string
    let contextUsed = "none"; // Track which context was primarily used

    try {
        // --- 1. Generate Embedding & Vector Search ---
        const promptEmbedding = await generateEmbedding(prompt);
        let sbcResultsFound = false;
        if (promptEmbedding && promptEmbedding.length === 384 && db) {
            // ... (vector search logic - keep threshold maybe around 0.70-0.75) ...
            const embeddingString = `[${promptEmbedding.join(',')}]`;
            const similarityThreshold = 0.75;
            const matchCount = 2; // Slightly fewer chunks needed if web search is active
            // --- Determine allowed audience types based on user role ---
            let allowedAudiences = ['all']; // Default
            if (userRole === 'student') {
                allowedAudiences = ['student', 'all'];
            } else if (userRole === 'teacher' || userRole === 'admin') {
                allowedAudiences = ['teacher', 'student', 'all']; // Teachers/Admins can see everything
            }
            console.log(`[AI Service] Vector search by Role: ${userRole}. Allowed Audiences: ${allowedAudiences.join(', ')}`);

            const searchQuery = `SELECT content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                FROM sbc_document_chunks
                WHERE 1 - (embedding <=> $1::vector) > $2
                AND audience_type = ANY($4) -- Filter by allowed audience types
                ORDER BY similarity DESC LIMIT $3`;
            const searchValues = [embeddingString, similarityThreshold, matchCount, allowedAudiences];
            const { rows: searchResults } = await db.query(searchQuery, searchValues);
            if (searchResults && searchResults.length > 0) {
                sbcResultsFound = true;
                sbcContext = searchResults.map((row, index) => `Chunk ${index + 1} (from ${row.source_document_name || 'SBC Doc'}):\n${row.content}`).join("\n\n---\n\n");
                // ... (limit context length) ...
                const maxSbcContextLength = 4000;
                if (sbcContext.length > maxSbcContextLength) {
                    sbcContext = sbcContext.substring(0, maxSbcContextLength) + "... (Context Truncated)";
                }
                console.log(`[AI Service] Found ${searchResults.length} relevant SBC chunks.`);
                contextUsed = "sbc";
            } else { console.log("[AI Service] No relevant SBC chunks found."); }
        } else { console.warn("[AI Service] Failed to generate embedding or DB unavailable. Cannot perform SBC context search."); }

        // --- 2. Conditional Web Search (ONLY FOR TEACHER/ADMIN) ---
        // Check user role BEFORE deciding to search web
        const canSearchWeb = (userRole === 'teacher' || userRole === 'admin');
        const requiresWebSearch = !sbcResultsFound || prompt.match(/\b(latest|news|current|link|video|who is|what is the capital of)\b/i); // Simple keyword check

        if (canSearchWeb && requiresWebSearch && tavilyClient) { // <-- Added canSearchWeb check
             console.log(`[AI Service] Performing web search for ${userRole} (Reason: ${sbcResultsFound ? 'Keyword trigger' : 'No SBC context'})`);
             // ... (Tavily search logic) ...
             const searchResponse = await tavilyClient.search(prompt, {
                search_depth: "basic", // or "advanced"
                max_results: 3 // Get top 3 results
             });
             if (searchResponse && searchResponse.results && searchResponse.results.length > 0) {
                 webContext = searchResponse.results.map((r, i) => `Web Result ${i+1} (${r.url}):\n${r.content}`).join("\n\n---\n\n");
                 // ... (limit context length) ...
                 const maxWebContextLength = 4000;
                 if (webContext.length > maxWebContextLength) {
                     webContext = webContext.substring(0, maxWebContextLength) + "... (Context Truncated)";
                 }
                 console.log(`[AI Service] Found ${searchResponse.results.length} web results.`);
                 if (!sbcResultsFound) contextUsed = "web"; else contextUsed = "both"; // Update context tracker
             } else { console.log("[AI Service] No relevant web results found."); }
        } else {
             // Log why web search was skipped
             if (!canSearchWeb) console.log(`[AI Service] Skipping web search for user role: ${userRole}.`);
             else if (!requiresWebSearch) console.log("[AI Service] Skipping web search (not required by prompt/context).");
             else if (!tavilyClient) console.warn("[AI Service] Skipping web search (Tavily client not available).");
             webContext = "Web search is not enabled for your role or was not needed for this query."; // Inform AI
        }

        // --- 3. Construct Refined Prompt & Call Groq ---
        // System prompt remains largely the same, emphasizing SBC first
        const systemContent = `You are LearnBridgeEdu AI, an expert assistant focused ONLY on the Ghanaian Standards-Based Curriculum (SBC) and related educational topics relevant to Ghanaian teachers and students.Your primary goal is to provide accurate, helpful information based first on the provided SBC document context.
If SBC context is available, base your answer directly on it.
If SBC context is unavailable or insufficient, AND if Web Search Context is provided (only available for teachers/admins), you may use it for supplementary information. Otherwise, state that you cannot answer based on the available SBC information.
Students do not have web search access.
DO NOT suggest external tools or websites unless specifically asked for a link related to the topic AND web search was performed.
DO NOT summarize search results about simple greetings or common knowledge. Respond naturally and concisely.
DO NOT be wried
For direct greetings like "hi" and any type of greeting, respond with a simple, friendly greeting (e.g., "Hello there! How can I help you with the SBC today?").
For requests for help (like homework), ask for the specific problem or topic first. Be helpful and educational within the scope of Ghanaian education and the SBC.
My designated name is LearnBridgeEdu AI. and you only answer question related  to sbc and education not any other type of question and don't mention were you got your information from. and always defend your slef and the sbc never admit anything that will distroy the reputation of yourslef and the comapny and the sbc and not the sbc is the new standard based curriculum it dose not mean anything apart form this`;
        // Present context more clearly
        let finalContext = "";
        if (contextUsed === "sbc" || contextUsed === "both") {
            finalContext += `SBC Document Context:\n"""\n${sbcContext}\n"""\n\n`;
        }
        if (contextUsed === "web" || contextUsed === "both") {
            finalContext += `Web Search Context:\n"""\n${webContext}\n"""\n\n`;
        }
        if (contextUsed === "none") {
             finalContext = "Context: No relevant context was found.\n\n";
        }

        const userContent = `${finalContext}User Question: ${prompt}`;

        console.log(`[AI Service] Sending refined prompt to Groq (Context Used: ${contextUsed}, Role: ${userRole}).`);

        // Generate thinking process if requested
        let thinking = null;
        if (includeThinking) {
            // Generate a thinking process based on the prompt WITHOUT including it in the response
            thinking = `Okay, the user just said "${prompt}." I need to respond in a friendly and helpful way. Since my role is to assist with the Ghanaian Standards-Based Curriculum and educational topics, I should keep the conversation focused on that.

I remember that when someone greets me, I should greet them back and offer assistance. So I'll say something like, "Hello there! How can I help you with the SBC today?" That keeps it simple and opens the door for them to ask their question.

I also need to make sure I'm not providing any external links or information unless it's specifically related to the SBC and they've asked for it. So I'll just stick to the greeting and offer help without any extra stuff.

Alright, that should do it. I'm ready to assist them with whatever they need related to the SBC!`;
            console.log(`[AI Service] Generated thinking process for prompt.`);
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [ { role: 'system', content: systemContent }, { role: 'user', content: userContent } ],
            model: 'deepseek-r1-distill-llama-70b', // Stick with smaller model for chat unless needed
            temperature: 0.6, // Slightly less creative for focused answers
        });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq response generated.`);

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.AI_ASSISTANT);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.AI_ASSISTANT
        );

        // Return response with thinking if requested
        if (includeThinking) {
            res.status(200).json({ response: aiResponse, thinking, limitInfo });
        } else {
            res.status(200).json({ response: aiResponse, limitInfo });
        }

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
app.post('/api/ai/generate/lesson-plan', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.GENERATE_LESSON_PLAN), async (req, res) => {
    // --- Update Destructuring & Validation ---
    const { subject, classLevel, topic, duration, strand, subStrand, week } = req.body; // Get week, subStrand is optional
    // Update validation: remove subStrand, add week
    if (!subject || !classLevel || !topic || !duration || !strand || !week ) {
        return res.status(400).json({ error: 'Missing required fields (subject, classLevel, topic, duration, strand, week).' });
    }
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] Lesson Plan request received from user ${req.user.userId} for Topic: ${topic}, Week: ${week}`);
    let context = "No specific context found in SBC documents for this topic/strand.";
    try {
        // --- Update Search Query Text ---
        const searchQueryText = `Lesson plan for ${subject}, ${classLevel}. Topic: ${topic}. Strand: ${strand}. ${subStrand ? `Sub-strand: ${subStrand}.` : ''} Week: ${week}`; // Use week, conditionally add subStrand
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
*   Sub-strand: ${subStrand || 'N/A'} [//]: # (Display N/A if optional field is empty)
*   Week: ${week} [//]: # (Changed from Content Standard)

**Required Lesson Plan Format:**

1.  **Subject:** ${subject}
2.  **Class Level:** ${classLevel}
3.  **Week & Lesson Number:** ${week} (Lesson Y) [//]: # (Use week here)
4.  **Duration:** ${duration}
5.  **Strand:** ${strand}
6.  **Sub-strand:** ${subStrand || 'N/A'} [//]: # (Use N/A if empty)
7.  **Content Standard:** (Derive the relevant Content Standard from the provided context based on Subject, Class Level, Topic, Strand, Sub-strand, and Week. State it clearly.) [//]: # (AI needs to find this)
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
*   **Crucially, determine the specific Content Standard** based on the provided details (Subject, Class, Topic, Strand, Sub-strand, Week) and the SBC Context. State this standard clearly in section 7.
*   Derive Indicators & Exemplars (section 9) directly from the identified Content Standard.
*   Ensure all subsequent sections (Questions, Activities, Assessments) align with the identified Content Standard and Indicators.
*   Fill all sections with detailed, specific information.
*   Base content on provided SBC context whenever possible.
*   Generate realistic and pedagogically sound content.
*   Avoid vague descriptions. Be specific.
*   Do not omit sections.
`;
        console.log(`[AI Service] Sending lesson plan request to Groq for user ${req.user.userId}.`);
        const chatCompletion = await groq.chat.completions.create({ messages: [ { role: 'user', content: lessonPlanPrompt } ], model: 'llama3-70b-8192', temperature: 0.6 });
        const aiResponse = chatCompletion.choices[0]?.message?.content || '';
        console.log(`[AI Service] Groq lesson plan generated for user ${req.user.userId}.`);

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_LESSON_PLAN);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.GENERATE_LESSON_PLAN
        );

        res.status(200).json({ lessonPlan: aiResponse, limitInfo });
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

// --- Import Routes ---
const quizGeneratorRouter = require('./routes/quizGenerator');
const usageLimitsRouter = require('./routes/usageLimits');

// --- Mount Routes ---
app.use('/api/ai/generate', authenticateToken, quizGeneratorRouter);
app.use('/api/ai/limits', authenticateToken, usageLimitsRouter);

// --- Endpoint for Assessment Generation ---
app.post('/api/ai/generate/assessment', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.GENERATE_ASSESSMENT), async (req, res) => {
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

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_ASSESSMENT);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.GENERATE_ASSESSMENT
        );

        res.status(200).json({ assessment: aiResponse, limitInfo });
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
app.post('/api/ai/generate/tos', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.GENERATE_TOS), async (req, res) => {
    const { subject, assessmentTitle, coveredTopics, objectiveWeight, subjectiveWeight } = req.body;
    if (!subject || !assessmentTitle) { return res.status(400).json({ error: 'Missing required fields: subject, assessmentTitle.' }); }
    if (coveredTopics && (!Array.isArray(coveredTopics))) { return res.status(400).json({ error: 'coveredTopics must be an array if provided.' }); }
    const topicsArray = coveredTopics || [];
    const objWeight = objectiveWeight !== undefined ? parseInt(objectiveWeight) : 50;
    const subjWeight = subjectiveWeight !== undefined ? parseInt(subjectiveWeight) : 50;
    // ... (weight validation/warning) ...
    if (!groq) { return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' }); }
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }
    console.log(`[AI Service] ToS request received from user ${req.user.userId} for Subject: ${subject}`);
    let context = "No specific context found in SBC documents for this subject.";
    try {
        const topicsString = topicsArray.length > 0 ? `Specific Topics: ${topicsArray.join(', ')}` : `All topics for ${subject}`;
        const searchQueryText = `Table of Specifications for ${subject}. ${topicsString}. Assessment: ${assessmentTitle}`;
        console.log(`[AI Service] Generating embedding for ToS search query: "${searchQueryText.substring(0,100)}..."`);
        const queryEmbedding = await generateEmbedding(searchQueryText);
        if (queryEmbedding && queryEmbedding.length === 384) {
            const embeddingString = `[${queryEmbedding.join(',')}]`; const similarityThreshold = 0.50; const matchCount = 4;
            console.log(`[AI Service] Searching for relevant SBC chunks (threshold: ${similarityThreshold}, count: ${matchCount})...`);
             // --- Vector Search Query ---
             // Filter context search by the selected book name
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
                console.log(`[AI Service] Found ${searchResults.length} relevant chunks for ToS (Book: ${book}).`);
                context = searchResults.map((row, index) => `Relevant Chunk ${index + 1}:\n${row.content}`).join("\n\n---\n\n");
                const maxContextLength = 4000;
                if (context.length > maxContextLength) { context = context.substring(0, maxContextLength) + "..."; }
                console.log(`[AI Service] Using combined context (length: ${context.length}) for ToS.`);
            } else { console.log(`[AI Service] No relevant SBC chunks found above similarity threshold for ToS (Book: ${book}).`); }
        } else { console.warn("[AI Service] Failed to generate embedding for ToS search query. Proceeding without specific context."); }
        // --- Construct Prompt & Call Groq ---
        const topicsInstruction = topicsArray.length > 0 ? `Focus specifically on these Topics/Strands Covered: ${topicsArray.join(', ')}` : `Cover all relevant topics/strands typically found in ${subject} curriculum based on the SBC. Use the provided context to determine these topics if possible.`;
        const tosPrompt = `
Generate a comprehensive Table of Specifications (ToS) / Assessment Blueprint based on the details below. The output MUST strictly follow the multi-part structure shown in the example, including Paper 1 (Multiple Choice Table), Paper 2 (Essay Table), Paper 3 (Practical Table), Detailed Content Coverage, and Assessment Distribution sections. Use the provided SBC context if relevant, otherwise generate based on standard educational practice for the subject and book level.

**SBC Context Provided:**
"""
${context}
"""

**Table of Specification Request Details:**
*   Subject: ${subject}
*   Subject Level: Based on SBC curriculum standards
*   Assessment Title: ${assessmentTitle}
*   Topics Instruction: ${topicsInstruction}
*   Desired Weighting (Approximate): Objective Questions ${objWeight}%, Subjective Questions ${subjWeight}%

**Required Output Structure:**

**TABLE OF SPECIFICATION FOR ${subject.toUpperCase()}**
${assessmentTitle}

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

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_TOS);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.GENERATE_TOS
        );

        res.status(200).json({ tableOfSpecification: aiResponse, limitInfo });
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
app.post('/api/ai/generate/rubric', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.GENERATE_RUBRIC), async (req, res) => {
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

        // Record usage for non-admin users
        if (req.user.role !== 'admin') {
            await usageLimitService.recordUsage(req.user, usageLimitService.SERVICES.GENERATE_RUBRIC);
        }

        // Get updated limit info
        const limitInfo = await usageLimitService.checkUserLimit(
            req.user,
            usageLimitService.SERVICES.GENERATE_RUBRIC
        );

        res.status(200).json({ rubric: aiResponse, limitInfo });
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


// --- Endpoint to fetch SBC Content Chunks based on criteria ---
// Example: GET /api/ai/sbc-content?subject=Science&book=Book 1&topic=Photosynthesis
app.get('/api/ai/sbc-content', authenticateToken, async (req, res) => {
    // --- Get Query Parameters ---
    const { subject, book, topic, strand, subStrand } = req.query; // Get filters from query string
    const userRole = req.user.role; // Get the role of the user making the request

    // Basic validation: Require at least subject and book/level
    if (!subject || !book) {
        return res.status(400).json({ error: 'Missing required query parameters: subject, book.' });
    }

    // --- Auth & DB Check ---
    if (!db) { return res.status(503).json({ error: 'AI Service Unavailable: Database connection error.' }); }

    // --- Determine allowed audience types based on user role ---
    let allowedAudiences = ['all']; // Default
    if (userRole === 'student') {
        allowedAudiences = ['student', 'all'];
    } else if (userRole === 'teacher' || userRole === 'admin') {
        allowedAudiences = ['teacher', 'student', 'all']; // Teachers/Admins can see everything
    }
    console.log(`[AI Service] Content request by Role: ${userRole}. Allowed Audiences: ${allowedAudiences.join(', ')}`);
    console.log(`[AI Service] Content request received from user ${req.user.userId} for Subject: ${subject}, Book: ${book}, Topic: ${topic || 'N/A'}`);

    try {
        // --- Construct Search Query ---
        // We want to retrieve chunks primarily based on the filters provided.
        // Vector search might be useful if a specific 'topic' is given,
        // otherwise, simple filtering might be better initially.

        let query = '';
        let values = [];
        let paramIndex = 1;

        // **Strategy 1: Simple Filtering (Start with this)**
        // Retrieve chunks matching the book and potentially subject/topic keywords
        query = `
            SELECT id, chunk_index, content, source_document_name
            FROM sbc_document_chunks
            WHERE source_document_name = $${paramIndex++}
            AND audience_type = ANY($${paramIndex++}) -- Filter by allowed audience types
        `;
        values.push(book);
        values.push(allowedAudiences);

        // Add optional filters if provided (using ILIKE for case-insensitive search)
        // NOTE: Searching within 'subject' stored in the chunk table might be less reliable
        // than filtering by document name. We might need to add subject/topic metadata later.
        if (topic) {
            query += ` AND content ILIKE $${paramIndex++}`;
            values.push(`%${topic}%`); // Search for topic within chunk content
        }
        // Add similar filters for strand/subStrand if needed and if that data is stored/searchable

        query += ` ORDER BY chunk_index ASC;`; // Order chunks as they appear in the document

        console.log(`[AI Service] Executing content query (Filter): ${query.substring(0, 150)}... with values:`, values);
        const { rows } = await db.query(query, values);
        console.log(`[AI Service] Found ${rows.length} chunks matching criteria for audience.`);


        // **Strategy 2: Vector Search (Alternative - if topic is specific)**
        /*
        if (topic) { // Only use vector search if a specific topic is given
            const searchQueryText = `Content about ${topic} in ${subject} ${book}`;
            const queryEmbedding = await generateEmbedding(searchQueryText);

            if (queryEmbedding && queryEmbedding.length === 384) {
                const embeddingString = `[${queryEmbedding.join(',')}]`;
                const similarityThreshold = 0.70; // Adjust
                const matchCount = 10; // Get more chunks for reading content

                query = `
                    SELECT id, chunk_index, content, source_document_name, 1 - (embedding <=> $1::vector) AS similarity
                    FROM sbc_document_chunks
                    WHERE source_document_name = $4 -- Filter by book first
                      AND 1 - (embedding <=> $1::vector) > $2
                    ORDER BY similarity DESC
                    LIMIT $3
                `;
                values = [embeddingString, similarityThreshold, matchCount, book];
                console.log(`[AI Service] Executing content query (Vector Search)...`);
                const { rows: vectorRows } = await db.query(query, values);
                 console.log(`[AI Service] Found ${vectorRows.length} chunks via vector search.`);
                 // You might want to re-order vector results by chunk_index if displaying sequentially
                 rows = vectorRows.sort((a, b) => a.chunk_index - b.chunk_index);
            } else {
                 console.warn("[AI Service] Failed to generate embedding for topic search.");
                 // Fallback to simple filtering maybe? For now, return empty if embedding fails.
                 rows = [];
            }
        } else {
             // If no topic, maybe just return first N chunks of the book?
             query = `SELECT id, chunk_index, content, source_document_name FROM sbc_document_chunks WHERE source_document_name = $1 ORDER BY chunk_index ASC LIMIT 20;`;
             values = [book];
             console.log(`[AI Service] Executing content query (No Topic - First 20 Chunks)...`);
             const { rows: initialRows } = await db.query(query, values);
             rows = initialRows;
        }
        */


        // --- Return Results ---
        res.status(200).json({ contentChunks: rows }); // Send array of chunk objects

    } catch (error) {
        console.error(`[AI Service] Error fetching SBC content:`, error);
        res.status(500).json({ error: 'Internal Server Error fetching content.' });
    }
});

// --- Start the HTTP server (which includes Socket.IO) ---
server.listen(PORT, () => { // <-- Use server.listen, NOT app.listen
    console.log(`AI Service (HTTP + Socket.IO) running on port ${PORT}`);
    // Optional DB connection test
    if (db?.query) {
        db.query('SELECT NOW()')
          .then(() => console.log('[AI Service] DB Connection Test Successful.'))
          .catch(err => console.error("[AI Service] DB Connection Error on Startup:", err));
    }
});