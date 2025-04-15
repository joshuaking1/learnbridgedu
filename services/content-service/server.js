// services/content-service/server.js
import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import supabase from './supabaseClient.js'; // Import Supabase client
import authenticateToken from './middleware/authenticateToken.js';
import authorizeRole from './middleware/authorizeRole.js';
import morgan from 'morgan'; // Use morgan for request logging
import fetch from 'node-fetch';

config();

const requestLogger = morgan;


const app = express();
const PORT = process.env.PORT || 3003;

// --- Multer Configuration ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF files are allowed.'), false);
        }
    }
});

// Middleware
app.use(cors());
app.use(helmet());
app.use(requestLogger('dev'));
// No express.json() needed for multipart/form-data primary route

// --- Routes ---

app.get('/api/content/health', (req, res) => {
    res.status(200).json({ status: 'Content Service is Up!' });
});

// File Upload Route (Protected: Admin Only)
app.post(
    '/api/content/upload/sbc',
    authenticateToken,
    authorizeRole(['admin']),
    upload.single('sbcFile'),
    async (req, res) => {
        console.log(`[Content Service] Upload request received by user ${req.user.userId}`);

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded or file rejected by filter.' });
        }

        // --- Get audienceType from req.body ---
        // Multer puts non-file fields here when using form-data
        const { audienceType } = req.body;
        const validAudienceTypes = ['teacher', 'student', 'all'];
        const finalAudienceType = validAudienceTypes.includes(audienceType) ? audienceType : 'all'; // Default to 'all' if invalid/missing
        console.log(`[Content Service] Audience type selected: ${finalAudienceType}`);
        // --- End Get Audience Type ---

        const file = req.file;
        const bucketName = 'sbc-documents';
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filePath = `uploads/${Date.now()}_${sanitizedFilename}`;

        console.log(`[Content Service] Attempting to upload "${file.originalname}" to bucket "${bucketName}" as "${filePath}"`);

        try {
            // 1. Upload the file buffer to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('[Content Service] Supabase upload error:', uploadError);
                let statusCode = 500;
                let message = 'Failed to upload file to storage.';
                if (uploadError.message.includes('duplicate')) { // Simplified duplicate check
                    statusCode = 409; message = 'A file with this name might already exist.';
                } else if (uploadError.message.includes('Bucket not found')) {
                    statusCode = 404; message = 'Storage bucket not found.';
                }
                return res.status(statusCode).json({ error: message, details: uploadError.message });
            }

            // --- Success ---
            console.log(`[Content Service] File uploaded successfully to Supabase:`, uploadData);
            const uploadedFilePath = uploadData.path; // Use path from successful upload data

            // --- 2. Trigger AI Service to Process/Embed the Document ---
            // Define AI service URL (ensure correct port)
            const aiServiceUrl = 'https://learnbridge-ai-service.onrender.com/api/ai/process-document';
            try {
                console.log(`[Content Service] Triggering AI service (${aiServiceUrl}) to process document: ${uploadedFilePath} (Audience: ${finalAudienceType})`);
                // Forward the authorization header from the original request
                const authorizationHeader = req.headers['authorization'];
                if (!authorizationHeader) {
                     console.warn('[Content Service] No authorization header found to forward to AI service.');
                     // Decide if processing should continue without auth? For now, we'll proceed but log warning.
                }

                const aiResponse = await fetch(aiServiceUrl, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         // Forward the original token - AI service will validate it
                         'Authorization': authorizationHeader || '',
                     },
                     body: JSON.stringify({
                         bucket: bucketName,
                         filePath: uploadedFilePath,
                         originalName: file.originalname, // Send original name too
                         audienceType: finalAudienceType // Pass audience type to AI service
                     }),
                });

                // Check if AI service responded successfully (even if processing had internal issues)
                if (!aiResponse.ok) {
                     const aiErrorText = await aiResponse.text(); // Get raw text in case of non-JSON error
                     console.error(`[Content Service] AI service responded with error (Status: ${aiResponse.status}): ${aiErrorText}`);
                     // Don't fail the upload, just log that background processing trigger failed
                } else {
                     const aiData = await aiResponse.json(); // Assume AI service sends JSON on success
                     console.log(`[Content Service] AI service processing trigger acknowledged for ${uploadedFilePath}:`, aiData.message || 'OK');
                }
            } catch (aiError) {
                 // Catch network errors connecting to AI service
                 console.error(`[Content Service] Network error calling AI service for ${uploadedFilePath}:`, aiError);
                 // Log error but still return success for the upload itself
            }
            // --- End Trigger AI Service ---

            // 3. Respond to the client about the upload success
            const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(uploadedFilePath);

            res.status(201).json({
                message: `File uploaded successfully! Processing started for audience: ${finalAudienceType}.`, // Updated message
                filePath: uploadedFilePath,
                publicUrl: urlData?.publicUrl
            });

        } catch (err) {
            console.error('[Content Service] Unexpected error during upload handling:', err);
            res.status(500).json({ error: 'An unexpected internal server error occurred.' });
        }
    }
);

// Error handler for Multer errors
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        console.error("[Multer Error]", error);
         if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `File too large. Maximum size is ${upload.limits.fileSize / 1024 / 1024}MB.` });
        }
         return res.status(400).json({ error: `File upload error: ${error.message}`});
    } else if (error) {
        console.error("[General Upload Error]", error);
        return res.status(400).json({ error: error.message || 'File upload failed.' });
    }
    next();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Content Service running on port ${PORT}`);
});