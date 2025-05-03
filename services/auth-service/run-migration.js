// services/auth-service/run-migration.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

// Create a connection pool using the DATABASE_URL from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    logger.info('Starting migration process...');
    
    // Create a migrations table if it doesn't exist to track applied migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get list of applied migrations
    const appliedResult = await client.query('SELECT name FROM migrations');
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.name));
    
    // Define migrations to run in order
    const migrations = [
      { name: '001_create_password_reset_tokens', file: '001_create_password_reset_tokens.sql' },
      { name: '002_add_account_lockout', file: '002_add_account_lockout.sql' },
      { name: '003_add_two_factor_auth', file: '003_add_two_factor_auth.sql' }
    ];
    
    // Filter out already applied migrations
    const pendingMigrations = migrations.filter(m => !appliedMigrations.has(m.name));
    
    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to apply.');
    } else {
      logger.info(`Found ${pendingMigrations.length} pending migrations to apply.`);
      
      // Run each pending migration in a separate transaction
      for (const migration of pendingMigrations) {
        await client.query('BEGIN');
        
        try {
          const migrationFile = path.join(__dirname, 'migrations', migration.file);
          const sql = fs.readFileSync(migrationFile, 'utf8');
          
          logger.info(`Executing migration: ${migration.file}`);
          await client.query(sql);
          
          // Record this migration as applied
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [migration.name]
          );
          
          await client.query('COMMIT');
          logger.info(`Migration ${migration.name} applied successfully.`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Failed to apply migration ${migration.name}:`, err);
          throw err; // Re-throw to stop the process
        }
      }
    }
    
    // List all applied migrations
    const { rows } = await client.query('SELECT name, applied_at FROM migrations ORDER BY applied_at');
    logger.info('Applied migrations:', rows);
    
  } catch (err) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error('Migration failed:', err);
    throw err;
  } finally {
    // Release client back to the pool
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    logger.info('Migration process finished.');
    process.exit(0);
  })
  .catch(err => {
    logger.error('Migration process failed:', err);
    process.exit(1);
  });