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

// --- Health Check ---
app.get('/api/learning-paths/health', async (req, res) => {
    console.log("Health check requested. Testing DB connection...");
    let isConnected = false;
    try {
        isConnected = await db.testConnection();
    } catch (error) {
        console.error("Error during health check DB test:", error);
    }

    if (isConnected) {
        res.status(200).json({ status: 'Learning Path Service is Up!', db_status: 'Connected' });
    } else {
        res.status(500).json({ status: 'Learning Path Service is Up!', db_status: 'Error Connecting' });
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
