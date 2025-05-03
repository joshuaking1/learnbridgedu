// services/user-service/run-migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Supabase database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

// Function to run a migration file
async function runMigration(filePath) {
    console.log(`Running migration: ${path.basename(filePath)}`);
    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        await pool.query(sql);
        console.log(`Migration ${path.basename(filePath)} completed successfully`);
        return true;
    } catch (error) {
        console.error(`Error running migration ${path.basename(filePath)}:`, error);
        // Check if the error is because the column already exists (common in reruns)
        if (error.code === '42701') { // 42701 is PostgreSQL code for 'duplicate_column'
            console.log(`Column might already exist. Skipping this migration.`);
            return true; // Treat as success if column already exists
        }
        return false;
    }
}

// Main function to run all migrations
async function runAllMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Read and execute each migration file
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            console.log(`Running migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await client.query(sql);
        }

        await client.query('COMMIT');
        console.log('All migrations completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error running migrations:', error);
        throw error;
    } finally {
        client.release();
        pool.end();
    }
}

// Execute the migration runner
runAllMigrations().catch(console.error);