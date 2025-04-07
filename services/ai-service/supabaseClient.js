// services/ai-service/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// Use the SERVICE ROLE KEY for backend operations (downloads etc)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("WARNING: Supabase URL or Service Role Key not found in .env for AI Service. PDF access will fail.");
    // process.exit(1); // Optional: Stop if keys are missing
}

// Initialize client using the Service Role Key
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
     auth: {
        autoRefreshToken: false,
        persistSession: false
    }
}) : null;

if (supabase) {
    console.log('Supabase client initialized for AI Service (using Service Role Key).');
}

module.exports = supabase; // Export the initialized client (or null)