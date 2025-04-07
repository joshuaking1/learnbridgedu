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