// services/ai-service/tavilyClient.js
const { tavily } = require('@tavily/core');
require('dotenv').config();

const tavilyApiKey = process.env.TAVILY_API_KEY;

if (!tavilyApiKey) {
    console.warn("WARNING: TAVILY_API_KEY not found in .env for AI Service. Web search will not work.");
}

let tavilyClient = null;

try {
    if (tavilyApiKey) {
        tavilyClient = tavily({ apiKey: tavilyApiKey });
        console.log('Tavily client initialized for AI Service.');
    }
} catch (error) {
    console.error('Error initializing Tavily client:', error);
}

module.exports = tavilyClient;