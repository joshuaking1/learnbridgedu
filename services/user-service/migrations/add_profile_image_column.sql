-- Add profile_image_url column to users table
ALTER TABLE users
ADD COLUMN profile_image_url VARCHAR(255);

COMMENT ON COLUMN users.profile_image_url IS 'URL of the user''s profile image stored in Supabase storage';