-- Run this in the Supabase SQL Editor

-- Add clerk_id column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id VARCHAR(255);

-- Create index on clerk_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Add a function to find users by clerk_id
CREATE OR REPLACE FUNCTION find_user_by_clerk_id(clerk_id_param VARCHAR)
RETURNS TABLE (
    id INTEGER,
    email VARCHAR,
    first_name VARCHAR,
    surname VARCHAR,
    role VARCHAR,
    clerk_id VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.first_name,
        u.surname,
        u.role,
        u.clerk_id
    FROM users u
    WHERE u.clerk_id = clerk_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create a Row Level Security (RLS) policy to allow access to users by clerk_id
-- This is useful for Supabase client-side queries
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own data
CREATE POLICY "Users can read their own data"
ON users FOR SELECT
USING (auth.uid()::text = clerk_id);

-- Policy to allow users to update their own data
CREATE POLICY "Users can update their own data"
ON users FOR UPDATE
USING (auth.uid()::text = clerk_id);

-- Policy to allow service role to access all users
CREATE POLICY "Service role can access all users"
ON users
USING (auth.role() = 'service_role');
