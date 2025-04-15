// services/ai-service/run-migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Create a database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Keep this for Supabase
});

// Function to run a migration file
async function runMigration(filePath) {
    console.log(`Running migration: ${filePath}`);
    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        await pool.query(sql);
        console.log(`Migration ${filePath} completed successfully`);
        return true;
    } catch (error) {
        console.error(`Error running migration ${filePath}:`, error);
        return false;
    }
}

// Main function to run all migrations
async function runAllMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');
    
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
