-- services/auth-service/migrations/001_create_password_reset_tokens.sql

-- Create the table to store password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE, -- Store a hash of the token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add an index for faster lookups by token hash
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Add an index for faster lookups/deletions by user_id
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Optional: Add a constraint or trigger to automatically delete expired tokens periodically
-- (This might be better handled by a scheduled job depending on the database system)

COMMENT ON TABLE password_reset_tokens IS 'Stores tokens for password reset requests.';
COMMENT ON COLUMN password_reset_tokens.user_id IS 'Foreign key referencing the user requesting the reset.';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'SHA-256 hash of the reset token sent to the user.';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Timestamp when the reset token becomes invalid.';