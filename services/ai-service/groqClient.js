// services/ai-service/groqClient.js
const Groq = require('groq-sdk');
require('dotenv').config();

const groqApiKey = process.env.GROQ_API_KEY;

if (!groqApiKey) {
    console.warn("WARNING: GROQ_API_KEY not found in .env for AI Service. AI features will not work.");
    // Don't necessarily exit, maybe allow service to run but endpoints fail
}

// Initialize Groq client
// Handle the case where the key might be missing during startup
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

if (groq) {
    console.log('Groq client initialized for AI Service.');
}

module.exports = groq; // Export the initialized client (or null if key missing)