// services/teacher-tools-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const authenticateToken = require('./middleware/authenticateToken');
// const authorizeRole = require('./middleware/authorizeRole'); // Import if needed for specific routes
const requestLogger = require('morgan');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json()); // Needed for POST/PUT bodies
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.get('/api/teacher-tools/health', (req, res) => {
    res.status(200).json({ status: 'Teacher Tools Service is Up!' });
});

// --- Lesson Plan Routes (To Be Implemented) ---
const lessonPlanRouter = require('./routes/lessonPlans'); // We will create this file next
app.use('/api/teacher-tools/lessons', authenticateToken, lessonPlanRouter); // Apply auth middleware to all lesson routes

const assessmentRouter = require('./routes/assessments'); // <-- Require the new router
app.use('/api/teacher-tools/assessments', authenticateToken, assessmentRouter); // <-- Use the new router

// TODO: Add routes for assessments, rubrics etc. later
// const assessmentRouter = require('./routes/assessments');
// app.use('/api/teacher-tools/assessments', authenticateToken, assessmentRouter);


// Basic Error Handling (optional improvement)
app.use((err, req, res, next) => {
    console.error("[TeacherToolsService Error]", err.stack);
    res.status(500).send('Something broke!');
});


// Start the server
app.listen(PORT, () => {
    console.log(`Teacher Tools Service running on port ${PORT}`);
    // Optional: Test DB connection on startup
    // db.testConnection?.().catch(err => console.error("DB Connection Error on Startup:", err));
});