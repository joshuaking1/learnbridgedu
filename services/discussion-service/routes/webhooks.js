// routes/webhooks.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Clerk webhook handler
router.post('/clerk', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  
  // Verify webhook signature if secret is provided
  if (webhookSecret) {
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];
    
    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({ error: 'Missing Svix headers' });
    }
    
    const body = JSON.stringify(req.body);
    const signaturePayload = `${svix_id}.${svix_timestamp}.${body}`;
    
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signaturePayload)
      .digest('hex');
    
    const expectedSignature = `v1,${signature}`;
    
    if (svix_signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  // Process webhook event
  const { type, data } = req.body;
  console.log(`Received Clerk webhook: ${type}`);
  
  try {
    // Handle user creation
    if (type === 'user.created') {
      const { id, first_name, last_name, email_addresses, image_url, public_metadata } = data;
      
      const firstName = first_name || '';
      const surname = last_name || '';
      const email = email_addresses[0]?.email_address || null;
      const role = public_metadata?.role || 'student';
      
      await db.query(
        `INSERT INTO users (
          first_name, 
          surname, 
          email, 
          profile_image_url, 
          role, 
          clerk_id,
          password_hash,
          created_at,
          updated_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, 'clerk-managed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE 
        SET first_name = $1, 
            surname = $2, 
            profile_image_url = $4, 
            role = $5, 
            clerk_id = $6,
            updated_at = CURRENT_TIMESTAMP`,
        [firstName, surname, email, image_url, role, id]
      );
      
      console.log(`User created/updated: ${id}`);
    }
    
    // Handle user update
    else if (type === 'user.updated') {
      const { id, first_name, last_name, email_addresses, image_url, public_metadata } = data;
      
      const firstName = first_name || '';
      const surname = last_name || '';
      const email = email_addresses[0]?.email_address || null;
      const role = public_metadata?.role || 'student';
      
      await db.query(
        `UPDATE users 
         SET first_name = $2, 
             surname = $3, 
             email = $4, 
             profile_image_url = $5, 
             role = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE clerk_id = $1`,
        [id, firstName, surname, email, image_url, role]
      );
      
      console.log(`User updated: ${id}`);
    }
    
    // Handle user deletion
    else if (type === 'user.deleted') {
      const { id } = data;
      
      // We don't actually delete the user, just mark them as deleted
      await db.query(
        `UPDATE users 
         SET first_name = 'Deleted', 
             surname = 'User', 
             email = NULL, 
             profile_image_url = NULL, 
             updated_at = CURRENT_TIMESTAMP
         WHERE clerk_id = $1`,
        [id]
      );
      
      console.log(`User marked as deleted: ${id}`);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(`Error processing webhook ${type}:`, err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}));

module.exports = router;
