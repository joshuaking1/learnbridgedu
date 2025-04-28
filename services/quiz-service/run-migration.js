// services/quiz-service/run-migration.js
require('dotenv').config();
const db = require('./db');
const migration = require('./migrations/004_create_usage_limits');

async function runMigration() {
    try {
        console.log('Running migration: 004_create_usage_limits');
        await migration.up(db);
        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

runMigration();
