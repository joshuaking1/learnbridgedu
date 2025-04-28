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
        // Fetch relevant user data
        // First check if user_sessions table exists
        let query;
        try {
            // Try to query with user_sessions table
            query = `
                SELECT u.id, u.first_name, u.surname, u.email, u.role, u.school, u.location,
                       u.position, u.phone, u.gender, u.created_at, u.email_verified,
                       s.last_login, s.is_online
                FROM users u
                LEFT JOIN user_sessions s ON u.id = s.user_id
                ORDER BY u.id ASC
            `;
            const result = await db.query(query);
            console.log(`[User Service] Successfully fetched ${result.rows.length} users for admin request.`);

            // Add default values for missing fields
            const usersWithDefaults = result.rows.map(user => ({
                ...user,
                is_online: user.is_online || false,
                last_login: user.last_login || null
            }));

            res.status(200).json(usersWithDefaults);
            return;
        } catch (err) {
            // If the error is about missing table, fall back to basic query
            if (err.code === '42P01') { // PostgreSQL error code for undefined_table
                console.log('[User Service] user_sessions table does not exist yet, falling back to basic query');
                query = `
                    SELECT id, first_name, surname, email, role, school, location,
                           position, phone, gender, created_at, email_verified
                    FROM users
                    ORDER BY id ASC
                `;

                const result = await db.query(query);

                // Add default values for online status and last login
                const usersWithDefaults = result.rows.map(user => ({
                    ...user,
                    is_online: false,
                    last_login: null
                }));

                console.log(`[User Service] Successfully fetched ${result.rows.length} users for admin request (basic query).`);
                res.status(200).json(usersWithDefaults);
                return;
            } else {
                // If it's another error, rethrow it
                throw err;
            }
        }

    } catch (err) {
        console.error("[User Service] Error fetching all users (Admin request):", err);
        res.status(500).json({ error: 'Internal Server Error fetching users.' });
    }
});

// GET Single User by ID (Admin only)
app.get('/api/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const userId = req.params.id;
    console.log(`[User Service] User details requested for ID: ${userId} by ADMIN user: ${req.user.userId}`);

    try {
        let query;
        try {
            // Try to query with user_sessions table
            query = `
                SELECT u.id, u.first_name, u.surname, u.email, u.role, u.school, u.location,
                       u.position, u.phone, u.gender, u.created_at, u.email_verified,
                       s.last_login, s.is_online
                FROM users u
                LEFT JOIN user_sessions s ON u.id = s.user_id
                WHERE u.id = $1
            `;
            const result = await db.query(query, [userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Add default values for missing fields
            const user = {
                ...result.rows[0],
                is_online: result.rows[0].is_online || false,
                last_login: result.rows[0].last_login || null
            };

            res.status(200).json(user);
            return;
        } catch (err) {
            // If the error is about missing table, fall back to basic query
            if (err.code === '42P01') { // PostgreSQL error code for undefined_table
                console.log('[User Service] user_sessions table does not exist yet, falling back to basic query');
                query = `
                    SELECT id, first_name, surname, email, role, school, location,
                           position, phone, gender, created_at, email_verified
                    FROM users
                    WHERE id = $1
                `;

                const result = await db.query(query, [userId]);

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }

                // Add default values for online status and last login
                const user = {
                    ...result.rows[0],
                    is_online: false,
                    last_login: null
                };

                res.status(200).json(user);
                return;
            } else {
                // If it's another error, rethrow it
                throw err;
            }
        }
    } catch (err) {
        console.error(`[User Service] Error fetching user ${userId}:`, err);
        res.status(500).json({ error: 'Internal Server Error fetching user details.' });
    }
});

// GET User Activity Logs (Admin only)
app.get('/api/users/:id/activity', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const userId = req.params.id;
    console.log(`[User Service] Activity logs requested for user ID: ${userId} by ADMIN user: ${req.user.userId}`);

    try {
        try {
            const query = `
                SELECT id, user_id, action, details, ip_address, created_at
                FROM user_activity_logs
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 50
            `;
            const result = await db.query(query, [userId]);

            res.status(200).json(result.rows);
            return;
        } catch (err) {
            // If the error is about missing table, return empty array
            if (err.code === '42P01') { // PostgreSQL error code for undefined_table
                console.log('[User Service] user_activity_logs table does not exist yet, returning empty array');
                res.status(200).json([]);
                return;
            } else {
                // If it's another error, rethrow it
                throw err;
            }
        }
    } catch (err) {
        console.error(`[User Service] Error fetching activity logs for user ${userId}:`, err);
        res.status(500).json({ error: 'Internal Server Error fetching activity logs.' });
    }
});

// UPDATE User Role (Admin only)
app.put('/api/users/:id/role', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;
    const adminId = req.user.userId;

    console.log(`[User Service] Role update requested for user ID: ${userId} by ADMIN user: ${adminId}`);

    // Validate role
    const validRoles = ['student', 'teacher', 'admin'];
    if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified' });
    }

    // Prevent changing own role (security measure)
    if (userId === adminId) {
        return res.status(403).json({ error: 'Cannot change your own role' });
    }

    try {
        // Start a transaction
        await db.query('BEGIN');

        // Update the user's role
        const updateQuery = `
            UPDATE users
            SET role = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING id, first_name, surname, email, role
        `;
        const updateResult = await db.query(updateQuery, [role, userId]);

        if (updateResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }

        // Log the activity if the table exists
        try {
            const logQuery = `
                INSERT INTO user_activity_logs (user_id, action, details, ip_address, created_by)
                VALUES ($1, $2, $3, $4, $5)
            `;
            const logValues = [
                userId,
                'role_change',
                `Role changed to ${role} by admin`,
                req.ip,
                adminId
            ];
            await db.query(logQuery, logValues);
        } catch (logErr) {
            // If the table doesn't exist, just log a message and continue
            if (logErr.code === '42P01') {
                console.log('[User Service] user_activity_logs table does not exist yet, skipping activity logging');
            } else {
                // For other errors, log but don't fail the transaction
                console.error('[User Service] Error logging role change activity:', logErr);
            }
        }

        // Commit the transaction
        await db.query('COMMIT');

        res.status(200).json({
            message: 'User role updated successfully',
            user: updateResult.rows[0]
        });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error(`[User Service] Error updating role for user ${userId}:`, err);
        res.status(500).json({ error: 'Internal Server Error updating user role.' });
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