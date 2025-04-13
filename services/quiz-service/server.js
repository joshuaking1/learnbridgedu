// services/quiz-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const authenticateToken = require('./middleware/authenticateToken');
const requestLogger = require('morgan');

const app = express();
const PORT = process.env.PORT || 3006;

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.get('/api/quizzes/health', (req, res) => {
    res.status(200).json({ status: 'Quiz Service is Up!' });
});

// --- Quiz Routes ---
const quizRouter = require('./routes/quizzes'); // We will create this file next
app.use('/api/quizzes', authenticateToken, quizRouter); // Apply auth to all quiz routes


// --- Error Handling ---
app.use((err, req, res, next) => {
    console.error(`[QuizService Error] ${req.method} ${req.path}:`, err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- 404 Handler ---
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Quiz Service running on port ${PORT}`);
    // Optional DB connection test
    if (db?.query) {
        db.query('SELECT NOW()')
          .then(() => console.log('[QuizService] DB Connection Test Successful.'))
          .catch(err => console.error("[QuizService] DB Connection Error on Startup:", err));
    }
});