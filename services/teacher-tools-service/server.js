// services/teacher-tools-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db'); // Make sure db.js exists and is configured
const authenticateToken = require('./middleware/authenticateToken'); // Make sure middleware exists
const checkUsageLimit = require('./middleware/checkUsageLimit'); // Usage limit middleware
const usageLimitService = require('./services/usageLimitService'); // Usage limit service
// const authorizeRole = require('./middleware/authorizeRole'); // Uncomment if needed later
const requestLogger = require('morgan');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json()); // Needed to parse JSON bodies for POST/PUT
app.use(express.urlencoded({ extended: true }));

// --- Routes ---

// Health Check
app.get('/api/teacher-tools/health', (req, res) => {
    // Optional: Add DB connection check here too
    res.status(200).json({ status: 'Teacher Tools Service is Up!' });
});

// --- Import Routers ---
const lessonPlanRouter = require('./routes/lessonPlans');
const assessmentRouter = require('./routes/assessments');
const tosRouter = require('./routes/tablesOfSpecs');
const rubricRouter = require('./routes/rubrics');
const usageLimitsRouter = require('./routes/usageLimits');

// --- Mount Routers ---
// Usage Limits Router
app.use('/api/teacher-tools/limits', authenticateToken, usageLimitsRouter);

// Lesson Plan Router with Usage Limits
app.use('/api/teacher-tools/lessons', authenticateToken, lessonPlanRouter);

// Assessment Router with Usage Limits
app.use('/api/teacher-tools/assessments', authenticateToken, assessmentRouter);

// Table of Specifications Router with Usage Limits
app.use('/api/teacher-tools/tos', authenticateToken, tosRouter);

// Rubric Router with Usage Limits
app.use('/api/teacher-tools/rubrics', authenticateToken, rubricRouter);


// TODO: Add routers for other teacher tools later
// Example:
// const assessmentRouter = require('./routes/assessments');
// app.use('/api/teacher-tools/assessments', authenticateToken, assessmentRouter);


// --- Basic Error Handling Middleware (Place after routes) ---
app.use((err, req, res, next) => {
    console.error(`[TeacherToolsService Error] ${req.method} ${req.path}:`, err.stack);
    // Avoid sending stack trace in production
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- 404 Handler (Place at the very end) ---
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Teacher Tools Service running on port ${PORT}`);
    // Optional: Test DB connection on startup if db.js exports a test function
    if (typeof db.testConnection === 'function') {
        db.testConnection().catch(err => console.error("[TeacherToolsService] DB Connection Error on Startup:", err));
    } else if (db.query) {
        // Basic query test if testConnection doesn't exist
        db.query('SELECT NOW()')
          .then(() => console.log('[TeacherToolsService] DB Connection Test Successful.'))
          .catch(err => console.error("[TeacherToolsService] DB Connection Error on Startup:", err));
    }
});