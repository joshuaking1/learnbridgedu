// services/user-service/routes/profile-image-url.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/authenticateToken');

// Update profile image URL
router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { imageUrl } = req.body;

    if (!imageUrl) {
        return res.status(400).json({ error: 'Image URL is required.' });
    }

    try {
        // Update user's profile_image_url in database
        const updateQuery = `
            UPDATE users 
            SET profile_image_url = $1, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 
            RETURNING id, first_name, surname, email, profile_image_url
        `;
        const result = await db.query(updateQuery, [imageUrl, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.status(200).json({
            message: 'Profile image URL updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating profile image URL:', error);
        res.status(500).json({ error: 'Internal server error during profile update.' });
    }
});

module.exports = router;
