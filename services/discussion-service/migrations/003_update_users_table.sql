-- Update users table for Clerk integration
-- This migration adds clerk_id column if it doesn't exist and ensures other needed columns are present

-- Add clerk_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'clerk_id'
    ) THEN
        ALTER TABLE users ADD COLUMN clerk_id VARCHAR(255);
    END IF;
END $$;

-- Add profile_image_url column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'profile_image_url'
    ) THEN
        ALTER TABLE users ADD COLUMN profile_image_url VARCHAR(255);
    END IF;
END $$;

-- Create index on clerk_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Insert a default bot user if it doesn't exist
INSERT INTO users (
    id, 
    first_name, 
    surname, 
    email, 
    password_hash, 
    role, 
    clerk_id
)
VALUES (
    9999, 
    'LearnBridgeEdu', 
    'Bot', 
    'bot@learnbridgedu.com', 
    'not-applicable', 
    'bot',
    'learnbridgeedu-bot'
)
ON CONFLICT (id) DO NOTHING;
