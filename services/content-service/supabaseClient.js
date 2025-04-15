// services/content-service/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL;
// Use the SERVICE ROLE KEY for backend operations (uploads)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL ERROR: Supabase URL or Service Role Key not found in .env for Content Service.");
    // process.exit(1); // Optional: Stop if keys are missing
}

// Initialize client using the Service Role Key for elevated privileges
const supabase = createClient(supabaseUrl, supabaseKey, {
     auth: {
        // Disable auto-refreshing tokens for service role key
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('Supabase client initialized for Content Service (using Service Role Key).');

export default supabase;