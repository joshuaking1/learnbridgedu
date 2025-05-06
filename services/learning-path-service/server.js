// services/learning-path-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db'); // Import db connection
const authenticateToken = require('./middleware/authenticateToken');
const authorizeRole = require('./middleware/authorizeRole');
const requestLogger = require('morgan'); // Use morgan for logging
const usageLimitService = require('./services/usageLimitService');
const checkUsageLimit = require('./middleware/checkUsageLimit');

const app = express();
const PORT = process.env.PORT || 3007; // Use a new port for this service

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Import Routers ---
const learningPathRouter = require('./routes/learningPaths');
const skillsRouter = require('./routes/skills');
const achievementsRouter = require('./routes/achievements');
const progressRouter = require('./routes/progress');
const recommendationsRouter = require('./routes/recommendations');
const usageLimitsRouter = require('./routes/usageLimits');

// --- Health Check with Warmup ---
let isWarmedUp = false;
let lastWarmupTime = null;

app.get('/api/learning-paths/health', async (req, res) => {
    console.log("Health check requested. Testing DB connection...");
    try {
        // Test DB connection
        const isConnected = await db.testConnection();
        
        // Check core service readiness
        const serviceReady = isConnected && isWarmedUp;
        
        // Auto-warmup on health check
        if (!isWarmedUp || (lastWarmupTime && Date.now() - lastWarmupTime > 5 * 60 * 1000)) {
            // Warm up connection pool and frequently accessed tables
            await Promise.all([
                db.query('SELECT COUNT(*) FROM learning_paths LIMIT 1'),
                db.query('SELECT COUNT(*) FROM skills LIMIT 1'),
                db.query('SELECT COUNT(*) FROM achievements LIMIT 1')
            ]);
            isWarmedUp = true;
            lastWarmupTime = Date.now();
        }

        res.status(200).json({
            status: 'Learning Path Service is Up!',
            ready: serviceReady,
            warmedUp: isWarmedUp,
            lastWarmup: lastWarmupTime,
            checks: {
                database: isConnected,
                cache: isWarmedUp
            }
        });
    } catch (error) {
        console.error("Error during health check:", error);
        res.status(503).json({
            status: 'Learning Path Service is Up but not ready!',
            ready: false,
            error: error.message
        });
    }
});

// Warmup endpoint
app.post('/api/learning-paths/warmup', async (req, res) => {
    try {
        // Warm up connection pool and frequently accessed tables
        await Promise.all([
            db.query('SELECT COUNT(*) FROM learning_paths LIMIT 1'),
            db.query('SELECT COUNT(*) FROM skills LIMIT 1'),
            db.query('SELECT COUNT(*) FROM achievements LIMIT 1')
        ]);
        
        // Update warmup status
        isWarmedUp = true;
        lastWarmupTime = Date.now();

        res.status(200).json({
            status: 'Warmup successful',
            warmedUp: true,
            lastWarmup: lastWarmupTime
        });
    } catch (error) {
        console.error('Warmup failed:', error);
        res.status(500).json({
            status: 'Warmup failed',
            error: error.message
        });
    }
});

// --- Mount Routers ---
// Usage Limits Router
app.use('/api/learning-paths/limits', authenticateToken, usageLimitsRouter);

// Learning Path Router
app.use('/api/learning-paths', authenticateToken, learningPathRouter);

// Skills Router
app.use('/api/learning-paths/skills', authenticateToken, skillsRouter);

// Achievements Router
app.use('/api/learning-paths/achievements', authenticateToken, achievementsRouter);

// Progress Router
app.use('/api/learning-paths/progress', authenticateToken, progressRouter);

// Recommendations Router
app.use('/api/learning-paths/recommendations', authenticateToken, recommendationsRouter);

// --- Error Handling ---
app.use((err, req, res, next) => {
    console.error(`[LearningPathService Error] ${req.method} ${req.path}:`, err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- 404 Handler ---
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Learning Path Service running on port ${PORT}`);
});

module.exports = app; // Export for testing
