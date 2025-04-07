// services/ai-service/utils/embeddingProcessor.js
const { pipeline, env } = require('@xenova/transformers');

// Configure Transformers.js for Node.js environment
env.allowLocalModels = false; // Use models from Hugging Face Hub
env.useBrowserCache = false; // Not applicable in Node.js

const modelName = 'Xenova/all-MiniLM-L6-v2'; // 384 dimensions
let extractor = null; // Cache the pipeline

// Lazy initialization of the model pipeline
async function getExtractor() {
    if (extractor === null) {
        try {
            console.log(`[Embeddings] Initializing embedding model: ${modelName}`);
            // Use 'feature-extraction' pipeline
            extractor = await pipeline('feature-extraction', modelName);
            console.log('[Embeddings] Embedding model initialized successfully.');
        } catch (error) {
            console.error('[Embeddings] Failed to initialize embedding model:', error);
            extractor = null; // Ensure it stays null on failure
        }
    }
    return extractor;
}

/**
 * Generates a vector embedding for a given text string.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]|null>} The embedding vector or null if an error occurs.
 */
async function generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
        console.error('[Embeddings] Invalid text input for embedding.');
        return null;
    }

    try {
        const pipe = await getExtractor();
        if (!pipe) {
            console.error('[Embeddings] Embedding pipeline not available.');
            return null; // Return null if initialization failed
        }

        // Generate embedding
        const output = await pipe(text, { pooling: 'mean', normalize: true });

        // Extract the vector data
        if (output && output.data) {
             if (output.data instanceof Float32Array) {
                return Array.from(output.data); // Convert Float32Array to number[]
             } else if (Array.isArray(output.data) && output.data.every(n => typeof n === 'number')) {
                 return output.data; // Already an array of numbers
             }
        }
        console.error('[Embeddings] Unexpected output format from model:', output);
        return null;

    } catch (error) {
        console.error(`[Embeddings] Error generating embedding for text: "${text.substring(0, 50)}..."`, error);
        return null;
    }
}

module.exports = { generateEmbedding, getExtractor }; // Export getExtractor if needed elsewhere