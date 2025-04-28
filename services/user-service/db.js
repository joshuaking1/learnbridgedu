// services/.../db.js
require('dotenv').config();

// --- ADD THIS LINE ---
console.log('DATABASE_URL Loaded:', !!process.env.DATABASE_URL); // Check if the variable exists

const { Pool } = require('pg');

// Check if the URL seems valid (basic check)
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
    console.error("FATAL ERROR: DATABASE_URL not found or invalid in .env file. Please check.");
    // process.exit(1); // Optional: Stop the service if DB URL is missing
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Keep this for Supabase
});

pool.on('connect', (client) => { // The 'connect' event receives the client object
    console.log('Service connected to Supabase database');
    // You could potentially release the client immediately if just checking connection
    // client.release(); // Optional: release the client obtained just for the 'connect' event
});

pool.on('error', (err, client) => { // The 'error' event also receives the client
    console.error('Database Pool Error:', err.stack);
});

// Setup tables if they don't exist
async function setupTables() {
    console.log('[User Service] Setting up tables if they don\'t exist...');
    let client;

    try {
        client = await pool.connect();

        // Check if user_sessions table exists
        const checkSessionsTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'user_sessions'
            );
        `;
        const sessionsExists = await client.query(checkSessionsTable);

        if (!sessionsExists.rows[0].exists) {
            console.log('[User Service] Creating user_sessions table...');

            // Create user_sessions table
            const createSessionsTable = `
                CREATE TABLE user_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    session_token TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    is_online BOOLEAN DEFAULT FALSE,
                    last_login TIMESTAMP WITH TIME ZONE,
                    last_activity TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(user_id)
                );

                CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
            `;

            await client.query(createSessionsTable);
            console.log('[User Service] user_sessions table created successfully');
        }

        // Check if user_activity_logs table exists
        const checkLogsTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'user_activity_logs'
            );
        `;
        const logsExists = await client.query(checkLogsTable);

        if (!logsExists.rows[0].exists) {
            console.log('[User Service] Creating user_activity_logs table...');

            // Create user_activity_logs table
            const createLogsTable = `
                CREATE TABLE user_activity_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    action TEXT NOT NULL,
                    details TEXT,
                    ip_address TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );

                CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
                CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);
            `;

            await client.query(createLogsTable);
            console.log('[User Service] user_activity_logs table created successfully');
        }

        console.log('[User Service] Table setup completed');
    } catch (error) {
        console.error('[User Service] Error setting up tables:', error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Initialize tables on module load
setupTables();

module.exports = {
    query: (text, params) => pool.query(text, params),
    // Optional: Add a function to explicitly test connection
    testConnection: async () => {
        let client;
        try {
            client = await pool.connect();
            console.log("Explicit connection test successful!");
            await client.query('SELECT NOW()'); // Perform a simple query
            return true;
        } catch (err) {
            console.error("Explicit connection test failed:", err);
            return false;
        } finally {
            if (client) {
                client.release(); // Always release the client!
            }
        }
    }
};