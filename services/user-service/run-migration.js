require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    console.log('Starting migration...');
    
    try {
        // Read the migration file
        const migrationPath = path.join(__dirname, 'migrations', '003_create_user_sessions_and_activity_logs.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Connect to the database
        const client = await pool.connect();
        
        try {
            // Start a transaction
            await client.query('BEGIN');
            
            // Run the migration
            await client.query(migrationSQL);
            
            // Commit the transaction
            await client.query('COMMIT');
            
            console.log('Migration completed successfully!');
        } catch (error) {
            // Rollback the transaction on error
            await client.query('ROLLBACK');
            console.error('Error running migration:', error);
            throw error;
        } finally {
            // Release the client back to the pool
            client.release();
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        // Close the pool
        await pool.end();
    }
}

// Run the migration
runMigration();
