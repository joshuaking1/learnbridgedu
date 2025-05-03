// Test database connection
const db = require('./db');
const logger = require('./logger');

async function testDB() {
    logger.info('Testing database connection...');
    
    try {
        const isConnected = await db.testConnection();
        if (isConnected) {
            logger.info('Successfully connected to database');
            
            // Test if the users table exists and has the required columns
            const result = await db.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name IN ('two_factor_enabled', 'two_factor_secret', 'two_factor_backup_codes')
            `);
            
            logger.info('2FA columns found:', result.rows);
        }
    } catch (error) {
        logger.error('Database test failed:', error);
    }
}

testDB();