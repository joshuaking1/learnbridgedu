-- services/auth-service/migrations/003_add_two_factor_auth.sql

-- Add two-factor authentication fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255),
ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB;

-- Create table to track 2FA verification attempts
CREATE TABLE IF NOT EXISTS two_factor_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    attempt_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    failure_reason VARCHAR(255)
);

-- Add index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_two_factor_attempts_user_id ON two_factor_attempts(user_id);

-- Create table for temporary 2FA verification tokens
CREATE TABLE IF NOT EXISTS two_factor_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster lookups by token_hash
CREATE INDEX IF NOT EXISTS idx_two_factor_tokens_token_hash ON two_factor_tokens(token_hash);

-- Add index for faster cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_two_factor_tokens_expires_at ON two_factor_tokens(expires_at);

COMMENT ON TABLE two_factor_attempts IS 'Tracks all 2FA verification attempts for security monitoring';
COMMENT ON TABLE two_factor_tokens IS 'Stores temporary tokens for 2FA verification during login';