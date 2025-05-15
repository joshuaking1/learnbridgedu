// Run forum database migrations
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('Starting forum database migration...');
  
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('Database connection successful!');
    
    // Read migration SQL file
    const migrationPath = path.join(__dirname, '001_create_forum_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Executing migration script...');
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      // Execute migration SQL
      await pool.query(migrationSQL);
      
      // Commit transaction if successful
      await pool.query('COMMIT');
      console.log('Migration completed successfully!');
    } catch (error) {
      // Rollback transaction on error
      await pool.query('ROLLBACK');
      console.error('Error during migration, transaction rolled back:', error.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('Database connection or migration error:', error.message);
    process.exit(1);
  } finally {
    // Close pool
    await pool.end();
  }
}

// Run the migration
runMigration();
