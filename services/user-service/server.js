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

// GET Admin Statistics (Requires 'admin' role)
app.get('/api/admin/stats', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    console.log(`[User Service] /api/admin/stats requested by ADMIN user: ${req.user.userId}`);

    try {
        // Get total users and active users
        const usersQuery = `
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN s.is_online = true THEN 1 END) as active_users
            FROM users u
            LEFT JOIN user_sessions s ON u.id = s.user_id
        `;
        const usersResult = await db.query(usersQuery);

        // Get total documents
        const documentsQuery = `
            SELECT COUNT(*) as total_documents
            FROM documents
        `;
        const documentsResult = await db.query(documentsQuery);

        // Get total quizzes
        const quizzesQuery = `
            SELECT COUNT(*) as total_quizzes
            FROM quizzes
        `;
        const quizzesResult = await db.query(quizzesQuery);

        // Get recent activity
        const activityQuery = `
            SELECT 
                'user' as type,
                CONCAT(u.first_name, ' ', u.surname, ' created an account') as description,
                u.created_at as timestamp
            FROM users u
            WHERE u.created_at >= NOW() - INTERVAL '7 days'
            UNION ALL
            SELECT 
                'document' as type,
                CONCAT('New document uploaded: ', d.title) as description,
                d.created_at as timestamp
            FROM documents d
            WHERE d.created_at >= NOW() - INTERVAL '7 days'
            UNION ALL
            SELECT 
                'quiz' as type,
                CONCAT('New quiz created: ', q.title) as description,
                q.created_at as timestamp
            FROM quizzes q
            WHERE q.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY timestamp DESC
            LIMIT 10
        `;
        const activityResult = await db.query(activityQuery);

        // Check system health (simplified example)
        const systemHealth = 'healthy'; // In a real system, this would check various metrics

        res.status(200).json({
            totalUsers: parseInt(usersResult.rows[0].total_users),
            activeUsers: parseInt(usersResult.rows[0].active_users),
            totalDocuments: parseInt(documentsResult.rows[0].total_documents),
            totalQuizzes: parseInt(quizzesResult.rows[0].total_quizzes),
            systemHealth,
            recentActivity: activityResult.rows
        });
    } catch (error) {
        console.error('[User Service] Error fetching admin statistics:', error);
        res.status(500).json({ error: 'Failed to fetch admin statistics' });
    }
});

// GET Admin Analytics (Requires 'admin' role)
app.get('/api/admin/analytics', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    console.log(`[User Service] /api/admin/analytics requested by ADMIN user: ${req.user.userId}`);

    const { timeRange = '30d' } = req.query;
    let interval;
    switch (timeRange) {
        case '7d':
            interval = '7 days';
            break;
        case '30d':
            interval = '30 days';
            break;
        case '90d':
            interval = '90 days';
            break;
        default:
            interval = '30 days';
    }

    try {
        // Get user engagement metrics
        const userEngagementQuery = `
            WITH daily_active AS (
                SELECT COUNT(DISTINCT user_id) as daily_active_users
                FROM user_sessions
                WHERE last_activity >= NOW() - INTERVAL '1 day'
                AND is_online = true
            ),
            weekly_active AS (
                SELECT COUNT(DISTINCT user_id) as weekly_active_users
                FROM user_sessions
                WHERE last_activity >= NOW() - INTERVAL '7 days'
                AND is_online = true
            ),
            monthly_active AS (
                SELECT COUNT(DISTINCT user_id) as monthly_active_users
                FROM user_sessions
                WHERE last_activity >= NOW() - INTERVAL '30 days'
                AND is_online = true
            ),
            session_stats AS (
                SELECT 
                    COUNT(*) as total_sessions,
                    AVG(EXTRACT(EPOCH FROM (session_end - session_start))) as avg_duration_seconds
                FROM user_sessions
                WHERE session_start >= NOW() - INTERVAL '${interval}'
            )
            SELECT 
                da.daily_active_users,
                wa.weekly_active_users,
                ma.monthly_active_users,
                ss.total_sessions,
                ss.avg_duration_seconds
            FROM daily_active da
            CROSS JOIN weekly_active wa
            CROSS JOIN monthly_active ma
            CROSS JOIN session_stats ss
        `;
        const userEngagementResult = await db.query(userEngagementQuery);

        // Get content engagement metrics
        const contentEngagementQuery = `
            WITH quiz_stats AS (
                SELECT 
                    COUNT(*) as total_quizzes_taken,
                    AVG(score) as average_score
                FROM quiz_attempts
                WHERE created_at >= NOW() - INTERVAL '${interval}'
            ),
            document_stats AS (
                SELECT 
                    COUNT(*) as total_views,
                    title as most_popular_document
                FROM document_views
                WHERE viewed_at >= NOW() - INTERVAL '${interval}'
                GROUP BY title
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
            SELECT 
                qs.total_quizzes_taken,
                qs.average_score,
                ds.total_views,
                ds.most_popular_document
            FROM quiz_stats qs
            CROSS JOIN document_stats ds
        `;
        const contentEngagementResult = await db.query(contentEngagementQuery);

        // Get time series data
        const timeSeriesQuery = `
            WITH RECURSIVE date_series AS (
                SELECT 
                    DATE_TRUNC('day', NOW() - INTERVAL '${interval}') as date
                UNION ALL
                SELECT date + INTERVAL '1 day'
                FROM date_series
                WHERE date < NOW()
            ),
            daily_stats AS (
                SELECT 
                    ds.date,
                    COUNT(DISTINCT us.user_id) as active_users,
                    COUNT(DISTINCT CASE WHEN u.created_at >= ds.date AND u.created_at < ds.date + INTERVAL '1 day' THEN u.id END) as new_users,
                    COUNT(DISTINCT qa.id) as quizzes_taken
                FROM date_series ds
                LEFT JOIN user_sessions us ON us.last_activity >= ds.date AND us.last_activity < ds.date + INTERVAL '1 day'
                LEFT JOIN users u ON u.created_at >= ds.date AND u.created_at < ds.date + INTERVAL '1 day'
                LEFT JOIN quiz_attempts qa ON qa.created_at >= ds.date AND qa.created_at < ds.date + INTERVAL '1 day'
                GROUP BY ds.date
                ORDER BY ds.date
            )
            SELECT 
                date,
                active_users,
                new_users,
                quizzes_taken
            FROM daily_stats
        `;
        const timeSeriesResult = await db.query(timeSeriesQuery);

        res.status(200).json({
            userEngagement: {
                dailyActiveUsers: parseInt(userEngagementResult.rows[0].daily_active_users),
                weeklyActiveUsers: parseInt(userEngagementResult.rows[0].weekly_active_users),
                monthlyActiveUsers: parseInt(userEngagementResult.rows[0].monthly_active_users),
                averageSessionDuration: formatDuration(parseInt(userEngagementResult.rows[0].avg_duration_seconds)),
                totalSessions: parseInt(userEngagementResult.rows[0].total_sessions)
            },
            contentEngagement: {
                totalQuizzesTaken: parseInt(contentEngagementResult.rows[0].total_quizzes_taken),
                averageQuizScore: parseFloat(contentEngagementResult.rows[0].average_score) || 0,
                totalDocumentsViewed: parseInt(contentEngagementResult.rows[0].total_views) || 0,
                mostPopularDocument: contentEngagementResult.rows[0].most_popular_document || 'N/A'
            },
            timeSeriesData: timeSeriesResult.rows.map(row => ({
                date: row.date.toISOString().split('T')[0],
                activeUsers: parseInt(row.active_users),
                newUsers: parseInt(row.new_users),
                quizzesTaken: parseInt(row.quizzes_taken)
            }))
        });
    } catch (error) {
        console.error('[User Service] Error fetching admin analytics:', error);
        res.status(500).json({ error: 'Failed to fetch admin analytics' });
    }
});

// GET System Settings (Requires 'admin' role)
app.get('/api/admin/settings', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    console.log(`[User Service] /api/admin/settings requested by ADMIN user: ${req.user.userId}`);

    try {
        // Get current settings from database
        const settingsQuery = `
            SELECT 
                site_name,
                site_description,
                maintenance_mode,
                registration_enabled,
                email_notifications,
                push_notifications,
                notification_frequency,
                password_min_length,
                password_require_uppercase,
                password_require_numbers,
                password_require_special_chars,
                session_timeout,
                two_factor_auth
            FROM system_settings
            WHERE id = 1
        `;
        const settingsResult = await db.query(settingsQuery);

        if (settingsResult.rows.length === 0) {
            // Return default settings if none exist
            res.status(200).json({
                general: {
                    siteName: 'LearnBridge',
                    siteDescription: 'Educational Platform',
                    maintenanceMode: false,
                    registrationEnabled: true
                },
                notifications: {
                    emailNotifications: true,
                    pushNotifications: true,
                    notificationFrequency: 'instant'
                },
                security: {
                    passwordPolicy: {
                        minLength: 8,
                        requireUppercase: true,
                        requireNumbers: true,
                        requireSpecialChars: true
                    },
                    sessionTimeout: 30,
                    twoFactorAuth: false
                }
            });
            return;
        }

        const settings = settingsResult.rows[0];
        res.status(200).json({
            general: {
                siteName: settings.site_name,
                siteDescription: settings.site_description,
                maintenanceMode: settings.maintenance_mode,
                registrationEnabled: settings.registration_enabled
            },
            notifications: {
                emailNotifications: settings.email_notifications,
                pushNotifications: settings.push_notifications,
                notificationFrequency: settings.notification_frequency
            },
            security: {
                passwordPolicy: {
                    minLength: settings.password_min_length,
                    requireUppercase: settings.password_require_uppercase,
                    requireNumbers: settings.password_require_numbers,
                    requireSpecialChars: settings.password_require_special_chars
                },
                sessionTimeout: settings.session_timeout,
                twoFactorAuth: settings.two_factor_auth
            }
        });
    } catch (error) {
        console.error('[User Service] Error fetching system settings:', error);
        res.status(500).json({ error: 'Failed to fetch system settings' });
    }
});

// PUT System Settings (Requires 'admin' role)
app.put('/api/admin/settings', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    console.log(`[User Service] /api/admin/settings update requested by ADMIN user: ${req.user.userId}`);

    try {
        const {
            general,
            notifications,
            security
        } = req.body;

        // Update settings in database
        const updateQuery = `
            INSERT INTO system_settings (
                id,
                site_name,
                site_description,
                maintenance_mode,
                registration_enabled,
                email_notifications,
                push_notifications,
                notification_frequency,
                password_min_length,
                password_require_uppercase,
                password_require_numbers,
                password_require_special_chars,
                session_timeout,
                two_factor_auth
            )
            VALUES (
                1,
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT (id) DO UPDATE SET
                site_name = EXCLUDED.site_name,
                site_description = EXCLUDED.site_description,
                maintenance_mode = EXCLUDED.maintenance_mode,
                registration_enabled = EXCLUDED.registration_enabled,
                email_notifications = EXCLUDED.email_notifications,
                push_notifications = EXCLUDED.push_notifications,
                notification_frequency = EXCLUDED.notification_frequency,
                password_min_length = EXCLUDED.password_min_length,
                password_require_uppercase = EXCLUDED.password_require_uppercase,
                password_require_numbers = EXCLUDED.password_require_numbers,
                password_require_special_chars = EXCLUDED.password_require_special_chars,
                session_timeout = EXCLUDED.session_timeout,
                two_factor_auth = EXCLUDED.two_factor_auth
        `;

        await db.query(updateQuery, [
            general.siteName,
            general.siteDescription,
            general.maintenanceMode,
            general.registrationEnabled,
            notifications.emailNotifications,
            notifications.pushNotifications,
            notifications.notificationFrequency,
            security.passwordPolicy.minLength,
            security.passwordPolicy.requireUppercase,
            security.passwordPolicy.requireNumbers,
            security.passwordPolicy.requireSpecialChars,
            security.sessionTimeout,
            security.twoFactorAuth
        ]);

        res.status(200).json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('[User Service] Error updating system settings:', error);
        res.status(500).json({ error: 'Failed to update system settings' });
    }
});

// Helper function to format duration
function formatDuration(seconds) {
    if (!seconds) return '0m';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

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