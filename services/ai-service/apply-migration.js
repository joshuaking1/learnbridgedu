// services/ai-service/apply-migration.js
require('dotenv').config();
const { Pool } = require('pg');

// Create a database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Keep this for Supabase
});

// SQL to add the user_id column
const migrationSQL = `
-- Add user_id column to sbc_document_chunks table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sbc_document_chunks' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE sbc_document_chunks 
        ADD COLUMN user_id VARCHAR(255) NULL;
        
        -- Add comment to explain the column
        COMMENT ON COLUMN sbc_document_chunks.user_id IS 'ID of the user who uploaded/processed this document';
    END IF;
END
$$;
`;

async function applyMigration() {
    try {
        console.log('Applying migration to add user_id column...');
        await pool.query(migrationSQL);
        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Error applying migration:', error);
    } finally {
        await pool.end();
    }
}

// Run the migration
applyMigration();
