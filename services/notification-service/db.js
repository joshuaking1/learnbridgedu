// Database connection setup for notification-service
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for some cloud database providers
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // Export the pool itself if needed for transactions
};