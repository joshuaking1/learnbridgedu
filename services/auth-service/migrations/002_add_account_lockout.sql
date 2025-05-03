-- services/auth-service/migrations/002_add_account_lockout.sql

-- Add account lockout fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ;

-- Create index for faster lookups when checking lockout status
CREATE INDEX IF NOT EXISTS idx_users_account_locked ON users(account_locked) WHERE account_locked = TRUE;

-- Create table to track login attempts for analytics and security monitoring
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- Store email even if user doesn't exist for tracking brute force attempts
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    attempt_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    failure_reason VARCHAR(255)
);

-- Add index for faster lookups by IP address (to detect distributed attacks)
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);

-- Add index for faster lookups by user_id (to track specific user's login history)
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);

COMMENT ON TABLE login_attempts IS 'Tracks all login attempts for security monitoring and analytics';
COMMENT ON COLUMN login_attempts.failure_reason IS 'Reason for login failure (invalid credentials, account locked, etc.)';