// services/.../db.js
require('dotenv').config();
const logger = require('./logger');
const config = require('./config');

// Check if DATABASE_URL is loaded
logger.info('DATABASE_URL Loaded:', { loaded: !!process.env.DATABASE_URL });

const { Pool } = require('pg');

// Check if the URL seems valid (basic check)
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
    logger.error("FATAL ERROR: DATABASE_URL not found or invalid in .env file. Please check.");
    // process.exit(1); // Optional: Stop the service if DB URL is missing
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Keep this for Supabase
});

pool.on('connect', (client) => { // The 'connect' event receives the client object
    logger.info('Service connected to database');
    // You could potentially release the client immediately if just checking connection
    // client.release(); // Optional: release the client obtained just for the 'connect' event
});

pool.on('error', (err, client) => { // The 'error' event also receives the client
    logger.error('Database Pool Error:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    
    // Get a client for transactions
    getClient: async () => {
        const client = await pool.connect();
        return client;
    },
    
    // Optional: Add a function to explicitly test connection
    testConnection: async () => {
        let client;
        try {
            client = await pool.connect();
            logger.info("Explicit connection test successful!");
            await client.query('SELECT NOW()'); // Perform a simple query
            return true;
        } catch (err) {
            logger.error("Explicit connection test failed:", err);
            return false;
        } finally {
            if (client) {
                client.release(); // Always release the client!
            }
        }
    }
};