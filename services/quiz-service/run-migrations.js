// services/quiz-service/run-migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Create a database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // For Supabase
});

// Path to migrations directory
const migrationsDir = path.join(__dirname, 'migrations');

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
        // Check if the error is because the table/column already exists (common in reruns)
        if (error.code === '42701' || error.code === '42P07') { 
            // 42701 is PostgreSQL code for 'duplicate_column'
            // 42P07 is PostgreSQL code for 'duplicate_table'
            console.log(`Table/column might already exist. Skipping this migration.`);
            return true; // Treat as success if table/column already exists
        }
        return false;
    }
}

// Function to run all migrations
async function runAllMigrations() {
    console.log('Starting database migrations for Quiz Service...');
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
        console.error(`Migrations directory not found: ${migrationsDir}`);
        process.exit(1);
    }
    
    try {
        // Get all SQL files in the migrations directory
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .map(file => path.join(migrationsDir, file));
        
        console.log(`Found ${files.length} migration files`);
        
        // Run each migration file
        for (const file of files) {
            const success = await runMigration(file);
            if (!success) {
                console.error(`Migration ${file} failed. Stopping.`);
                process.exit(1);
            }
        }
        
        console.log('All migrations completed successfully');
    } catch (error) {
        console.error('Error running migrations:', error);
        process.exit(1);
    } finally {
        // Close the database connection
        await pool.end();
    }
}

// Run the migrations
runAllMigrations();
