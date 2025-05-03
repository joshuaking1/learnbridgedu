// services/learning-path-service/db.js
require('dotenv').config();
const { Pool } = require('pg');

// Create a database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the database connection
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('[LearningPathService] Database connection successful:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('[LearningPathService] Database connection error:', error);
        return false;
    }
}

// Export the pool and a query function
module.exports = {
    query: (text, params) => pool.query(text, params),
    testConnection,
    pool
};
