// services/user-service/supabaseClient.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Get Supabase configuration from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
// Use the SERVICE ROLE KEY for backend operations (uploads)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL ERROR: Supabase URL or Service Role Key not found in .env for User Service.");
    process.exit(1);
}

// Initialize client using the Service Role Key for elevated privileges
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        // Disable auto-refreshing tokens for service role key
        autoRefreshToken: false,
        persistSession: false
    }
});

// Verify that DATABASE_URL is loaded
console.log('DATABASE_URL Loaded:', !!process.env.DATABASE_URL);

console.log('Supabase client initialized for User Service (using Service Role Key).');

module.exports = supabase;