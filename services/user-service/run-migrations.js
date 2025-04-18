// services/user-service/run-migrations.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Create a database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Add SSL configuration if required for your database connection
    // ssl: { rejectUnauthorized: false } // Example for Supabase
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
    const migrationsDir = path.join(__dirname, 'migrations');

    try {
        // Ensure migrations directory exists
        if (!fs.existsSync(migrationsDir)) {
            console.log('Migrations directory does not exist. No migrations to run.');
            return;
        }

        // Get all SQL files in the migrations directory
        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort() // Ensure migrations run in a consistent order (alphabetical)
            .map(file => path.join(migrationsDir, file));

        if (files.length === 0) {
            console.log('No migration files found.');
            return;
        }

        console.log(`Found ${files.length} migration files`);

        // Run each migration file sequentially
        for (const file of files) {
            const success = await runMigration(file);
            if (!success) {
                console.error(`Migration ${path.basename(file)} failed. Stopping.`);
                process.exit(1); // Exit with error code
            }
        }

        console.log('All migrations completed successfully');
    } catch (error) {
        console.error('Error running migrations:', error);
        process.exit(1); // Exit with error code
    } finally {
        await pool.end(); // Close the database connection
        console.log('Database connection closed.');
    }
}

// Execute the migration runner
runAllMigrations();