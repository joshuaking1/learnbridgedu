// services/user-service/routes/profile.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const supabase = require('../supabaseClient');
const authenticateToken = require('../middleware/authenticateToken');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Update profile image
router.post('/image', authenticateToken, upload.single('profileImage'), async (req, res) => {
    const userId = req.user.userId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    try {
        const timestamp = Date.now();
        const fileExt = file.originalname.split('.').pop();
        const filePath = `profile-images/${userId}_${timestamp}.${fileExt}`;
        const bucketName = 'user-profiles';

        // Upload image to Supabase Storage with proper authentication
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
                cacheControl: '3600'
            });

        if (uploadError) {
            console.error('Error uploading profile image:', uploadError);
            return res.status(500).json({ error: 'Failed to upload profile image.' });
        }

        // Get the public URL of the uploaded image
        const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);

        // Update user's profile_image_url in database
        const updateQuery = `
            UPDATE users 
            SET profile_image_url = $1, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 
            RETURNING id, first_name, surname, email, profile_image_url
        `;
        const result = await db.query(updateQuery, [publicUrl, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.status(200).json({
            message: 'Profile image updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Error in profile image upload:', error);
        res.status(500).json({ error: 'Internal server error during profile update.' });
    }
});

module.exports = router;