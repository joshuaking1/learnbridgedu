// services/ai-service/migrations/004_create_usage_limits.js

/**
 * Migration to create the usage_limits table for tracking daily service usage
 */
exports.up = async (client) => {
    // Create the usage_limits table
    await client.query(`
        CREATE TABLE IF NOT EXISTS usage_limits (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            service_name VARCHAR(50) NOT NULL,
            usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
            usage_count INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, service_name, usage_date)
        );
        
        -- Index for faster lookups by user_id and date
        CREATE INDEX IF NOT EXISTS idx_usage_limits_user_date 
        ON usage_limits(user_id, usage_date);
        
        -- Comment on table
        COMMENT ON TABLE usage_limits IS 'Tracks daily usage limits for various services by user';
    `);
    
    console.log('Created usage_limits table');
};

exports.down = async (client) => {
    // Drop the usage_limits table
    await client.query(`
        DROP TABLE IF EXISTS usage_limits;
    `);
    
    console.log('Dropped usage_limits table');
};
