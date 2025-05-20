// services/ai-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { Groq } = require('groq-sdk');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// --- Environment Variables ---
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DB_CONNECTION_STRING = process.env.DATABASE_URL;

// --- Initialize Express App ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// --- Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Initialize Groq Client ---
let groq = null;
if (GROQ_API_KEY) {
    groq = new Groq({ apiKey: GROQ_API_KEY });
    console.log('[AI Service] Groq client initialized.');
} else {
    console.warn('[AI Service] WARNING: GROQ_API_KEY not set. AI generation will not work.');
}

// --- Initialize Database Connection ---
let db = null;
if (DB_CONNECTION_STRING) {
    db = new Pool({
        connectionString: DB_CONNECTION_STRING,
        ssl: { rejectUnauthorized: false }
    });
    console.log('[AI Service] Database connection initialized.');
} else {
    console.warn('[AI Service] WARNING: DATABASE_URL not set. Vector search will not work.');
}

// --- Authentication Middleware ---
// TEMPORARY: Modified for presentation to bypass JWT verification
function authenticateToken(req, res, next) {
    console.log('[AI Service] Using temporary authentication bypass for presentation');
    
    // Set a mock user for all requests
    req.user = {
        userId: 'presentation-user',
        role: 'admin', // Admin role to bypass usage limits
        email: 'presentation@learnbridge.edu',
        firstName: 'LearnBridge',
        lastName: 'Presenter'
    };
    
    // Continue to the next middleware
    next();
    
    /* ORIGINAL CODE - Temporarily commented out
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('[AI Service] JWT Verification Error:', err);
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ error: 'Invalid or expired token: Token has expired.', details: err.message });
            } else {
                return res.status(403).json({ error: 'Invalid or expired token: Verification failed.', details: err.message });
            }
        }
        req.user = user;
        next();
    });
    */
}

// --- Usage Limit Service ---
const usageLimitService = {
    SERVICES: {
        GENERATE_QUIZ: 'generate_quiz',
        GENERATE_LESSON_PLAN: 'generate_lesson_plan',
        GENERATE_ASSESSMENT: 'generate_assessment',
        GENERATE_TOS: 'generate_tos',
        GENERATE_RUBRIC: 'generate_rubric'
    },
    
    async checkUserLimit(user, service) {
        // Implementation details
        return { 
            hasLimit: false, 
            used: 0, 
            limit: 100, 
            remaining: 100 
        };
    },
    
    async recordUsage(user, service) {
        // Implementation details
        return true;
    }
};

// --- Usage Limit Middleware ---
function checkUsageLimit(service) {
    return async (req, res, next) => {
        // Skip limit check for admin users
        if (req.user.role === 'admin') {
            return next();
        }
        
        try {
            const limitInfo = await usageLimitService.checkUserLimit(req.user, service);
            
            if (limitInfo.hasLimit && limitInfo.remaining <= 0) {
                return res.status(429).json({
                    error: `Usage limit reached for ${service}. Please try again later.`,
                    limitInfo
                });
            }
            
            next();
        } catch (error) {
            console.error(`[AI Service] Error checking usage limit:`, error);
            // Allow the request to proceed even if limit check fails
            next();
        }
    };
}

// --- Existing HTTP Routes ---

// Health Check
app.get('/api/ai/health', (_, res) => {
    res.status(200).json({
        status: 'AI Service is Up!',
        groqClientInitialized: !!groq,
        dbConnectionInitialized: !!db
    });
});

// --- Import Routes ---
const quizGeneratorRouter = require('./routes/quizGenerator');
const usageLimitsRouter = require('./routes/usageLimits');
const forumBotRoutes = require('./routes/forumBot');

// --- Mount Routes ---
app.use('/api/ai/generate', authenticateToken, quizGeneratorRouter);
app.use('/api/ai/limits', authenticateToken, usageLimitsRouter);
app.use('/api/forum-bot', forumBotRoutes);

// --- Start the HTTP server (which includes Socket.IO) ---
server.listen(PORT, () => {
    console.log(`AI Service (HTTP + Socket.IO) running on port ${PORT}`);
    // Optional DB connection test
    if (db?.query) {
        db.query('SELECT NOW()')
          .then(() => console.log('[AI Service] DB Connection Test Successful.'))
          .catch(err => console.error("[AI Service] DB Connection Error on Startup:", err));
    }
});

// --- Helper function for generating embeddings ---
async function generateEmbedding() {
    try {
        // Implementation details
        return []; // Placeholder
    } catch (error) {
        console.error('[AI Service] Error generating embedding:', error);
        return null;
    }
}

// Export for testing
module.exports = { app, server };
