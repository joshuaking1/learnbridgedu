// Add this to the top of your server.js file or create a separate setup script

async function setupTables(db) {
    console.log('[User Service] Setting up tables if they don\'t exist...');
    
    try {
        // Check if user_sessions table exists
        const checkSessionsTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_sessions'
            );
        `;
        const sessionsExists = await db.query(checkSessionsTable);
        
        if (!sessionsExists.rows[0].exists) {
            console.log('[User Service] Creating user_sessions table...');
            
            // Create user_sessions table
            const createSessionsTable = `
                CREATE TABLE user_sessions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    session_token TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    is_online BOOLEAN DEFAULT FALSE,
                    last_login TIMESTAMP WITH TIME ZONE,
                    last_activity TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(user_id)
                );
                
                CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
            `;
            
            await db.query(createSessionsTable);
            console.log('[User Service] user_sessions table created successfully');
        }
        
        // Check if user_activity_logs table exists
        const checkLogsTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'user_activity_logs'
            );
        `;
        const logsExists = await db.query(checkLogsTable);
        
        if (!logsExists.rows[0].exists) {
            console.log('[User Service] Creating user_activity_logs table...');
            
            // Create user_activity_logs table
            const createLogsTable = `
                CREATE TABLE user_activity_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    action TEXT NOT NULL,
                    details TEXT,
                    ip_address TEXT,
                    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                
                CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
                CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);
            `;
            
            await db.query(createLogsTable);
            console.log('[User Service] user_activity_logs table created successfully');
        }
        
        console.log('[User Service] Table setup completed');
    } catch (error) {
        console.error('[User Service] Error setting up tables:', error);
        throw error;
    }
}

module.exports = { setupTables };
