// services/ai-service/utils/pdfProcessor.js
const supabase = require('../supabaseClient'); // Use the initialized Supabase client
const pdf = require('pdf-parse'); // Import pdf-parse

/**
 * Downloads a PDF from Supabase Storage and extracts its text content.
 * @param {string} bucketName - The name of the Supabase bucket (e.g., 'sbc-documents').
 * @param {string} filePath - The path to the file within the bucket (e.g., 'uploads/document.pdf').
 * @returns {Promise<string|null>} The extracted text content or null if an error occurs.
 */
async function getTextFromPdf(bucketName, filePath) {
    if (!supabase) {
        console.error('[PDF Processor] Supabase client not initialized.');
        return null;
    }
    if (!bucketName || !filePath) {
        console.error('[PDF Processor] Bucket name and file path are required.');
        return null;
    }

    console.log(`[PDF Processor] Attempting to download: ${bucketName}/${filePath}`);

    try {
        // 1. Download the file as an ArrayBuffer from Supabase Storage
        const { data: blobData, error: downloadError } = await supabase.storage
            .from(bucketName)
            .download(filePath); // Downloads the file content

        if (downloadError) {
            console.error(`[PDF Processor] Error downloading file from Supabase: ${downloadError.message}`);
            return null;
        }

        if (!blobData) {
             console.error(`[PDF Processor] No data received for file: ${filePath}`);
             return null;
        }

        // Convert Blob/File data (ArrayBuffer) to a Buffer Node.js can use
        const fileBuffer = Buffer.from(await blobData.arrayBuffer());
        console.log(`[PDF Processor] File downloaded successfully (${(fileBuffer.length / 1024).toFixed(2)} KB). Parsing text...`);

        // 2. Parse the PDF buffer using pdf-parse
        const pdfData = await pdf(fileBuffer);

        // pdfData contains properties like 'numpages', 'numrender', 'info', 'metadata', 'text'
        console.log(`[PDF Processor] Text extracted successfully (${pdfData.numpages} pages).`);
        return pdfData.text; // Return the extracted text

    } catch (error) {
        console.error(`[PDF Processor] Error processing PDF ${filePath}:`, error);
        return null; // Return null on failure
    }
}

module.exports = { getTextFromPdf };