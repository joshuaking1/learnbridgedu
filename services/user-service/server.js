// services/user-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db'); // Import db connection
const authenticateToken = require('./middleware/authenticateToken');
const authorizeRole = require('./middleware/authorizeRole'); // <-- Import authorizeRole
const requestLogger = require('morgan'); // Use morgan for logging
const profileRoutes = require('./routes/profile'); // Import profile routes
const profileImageUrlRoutes = require('./routes/profile-image-url'); // Import profile image URL routes

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Public Routes ---

// Health Check
app.get('/api/users/health', async (req, res) => {
    console.log("Health check requested. Testing DB connection...");
    let isConnected = false;
    try {
         isConnected = await db.testConnection();
    } catch (error) {
         console.error("Error during health check DB test:", error);
    }

    if (isConnected) {
        res.status(200).json({ status: 'User Service is Up!', db_status: 'Connected' });
    } else {
        res.status(500).json({ status: 'User Service is Up!', db_status: 'Error Connecting' });
    }
});

// --- Protected User Routes ---

// Mount profile routes
app.use('/api/users/profile', profileRoutes);

// Mount profile image URL routes
app.use('/api/users/profile/image-url', profileImageUrlRoutes);

// GET Current Logged-in User's Profile (Any authenticated user)
app.get('/api/users/me', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    if (!userId) {
         return res.status(400).json({ error: 'User ID not found in token payload.' });
    }

    try {
        console.log(`[User Service] Fetching profile for user ID: ${userId}`);
        const query = `
            SELECT id, first_name, surname, email, school, location, position, phone, gender, role, email_verified, created_at, updated_at
            FROM users
            WHERE id = $1
        `;
        const result = await db.query(query, [userId]);
        const userProfile = result.rows[0];

        if (!userProfile) {
            console.warn(`[User Service] Profile not found in DB for user ID: ${userId} (from valid token)`);
            return res.status(404).json({ error: 'User profile not found.' });
        }

        console.log(`[User Service] Profile found for user ID: ${userId}`);
        res.status(200).json(userProfile);

    } catch (err) {
        console.error(`[User Service] Error fetching profile for user ${userId}:`, err);
        res.status(500).json({ error: 'Internal Server Error while fetching profile.' });
    }
});


// --- Admin Protected Route ---

// GET All Users (Requires 'admin' role)
// Apply authenticateToken first, then authorizeRole
app.get('/api/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    // If both middlewares pass, req.user exists and has role 'admin'
    console.log(`[User Service] /api/users requested by ADMIN user: ${req.user.userId}`);

    try {
        // Fetch relevant user data - avoid sending password hashes or excessive info
        // Implement pagination in a real application (e.g., using LIMIT and OFFSET)
        const query = `
            SELECT id, first_name, surname, email, role, school, position, created_at, email_verified
            FROM users
            ORDER BY id ASC
        `;
        const result = await db.query(query);

        console.log(`[User Service] Successfully fetched ${result.rows.length} users for admin request.`);
        res.status(200).json(result.rows); // Send the list of users

    } catch (err) {
        console.error("[User Service] Error fetching all users (Admin request):", err);
        res.status(500).json({ error: 'Internal Server Error fetching users.' });
    }
});

// TODO: Add routes for PUT /:id (update profile - self or admin), DELETE /:id (admin only)
// These routes will also need the `authenticateToken` middleware and potentially `authorizeRole`.
// Example: Update own profile (requires login)
// app.put('/api/users/me', authenticateToken, async (req, res) => { ... });
// Example: Update any profile (requires admin)
// app.put('/api/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => { ... });


// Start the server
app.listen(PORT, () => {
    console.log(`User Service running on port ${PORT}`);
});