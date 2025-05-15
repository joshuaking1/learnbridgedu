// routes/users.js
const express = require('express');
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get user by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT id, first_name, surname, email, profile_image_url, role, created_at, updated_at, clerk_id
       FROM users 
       WHERE clerk_id = $1 OR id = $2`,
      [id, parseInt(id, 10)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Format the response
    const user = result.rows[0];
    const formattedUser = {
      id: user.id,
      clerk_id: user.clerk_id,
      name: `${user.first_name} ${user.surname}`.trim(),
      email: user.email,
      avatar_url: user.profile_image_url,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
    
    res.json(formattedUser);
  } catch (err) {
    console.error(`Error fetching user id ${id}:`, err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}));

// Create or update user from Clerk
router.post('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id, first_name, last_name, email, avatar_url, role } = req.body;
  
  // Validate required fields
  if (!id) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  try {
    // Check if user exists by clerk_id
    const checkResult = await db.query('SELECT id FROM users WHERE clerk_id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      // Create new user
      const insertResult = await db.query(
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
        RETURNING id, first_name, surname, email, profile_image_url, role, clerk_id, created_at, updated_at`,
        [
          first_name || '', 
          last_name || '', 
          email, 
          avatar_url, 
          role || 'student',
          id
        ]
      );
      
      // Format the response
      const user = insertResult.rows[0];
      const formattedUser = {
        id: user.id,
        clerk_id: user.clerk_id,
        name: `${user.first_name} ${user.surname}`.trim(),
        email: user.email,
        avatar_url: user.profile_image_url,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
      
      res.status(201).json(formattedUser);
    } else {
      // Update existing user
      const updateResult = await db.query(
        `UPDATE users 
         SET first_name = $2, 
             surname = $3, 
             email = $4, 
             profile_image_url = $5, 
             role = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE clerk_id = $1 
         RETURNING id, first_name, surname, email, profile_image_url, role, clerk_id, created_at, updated_at`,
        [id, first_name || '', last_name || '', email, avatar_url, role || 'student']
      );
      
      // Format the response
      const user = updateResult.rows[0];
      const formattedUser = {
        id: user.id,
        clerk_id: user.clerk_id,
        name: `${user.first_name} ${user.surname}`.trim(),
        email: user.email,
        avatar_url: user.profile_image_url,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
      
      res.json(formattedUser);
    }
  } catch (err) {
    console.error('Error creating/updating user:', err);
    res.status(500).json({ error: 'Failed to create/update user' });
  }
}));

// Bulk create or update users
router.post('/bulk', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { users } = req.body;
  
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Users array is required' });
  }
  
  try {
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      
      for (const user of users) {
        const { id, name, email, avatar_url, role } = user;
        
        if (!id) {
          continue; // Skip invalid users
        }
        
        // Split name into first_name and surname
        const nameParts = name ? name.split(' ') : ['', ''];
        const first_name = nameParts[0] || '';
        const surname = nameParts.slice(1).join(' ') || '';
        
        // Check if user exists
        const checkResult = await client.query('SELECT id FROM users WHERE clerk_id = $1', [id]);
        
        if (checkResult.rows.length === 0) {
          // Create new user
          const insertResult = await client.query(
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
            RETURNING id`,
            [first_name, surname, email, avatar_url, role || 'student', id]
          );
          
          results.push({ id, action: 'created' });
        } else {
          // Update existing user
          const updateResult = await client.query(
            `UPDATE users 
             SET first_name = $2, 
                 surname = $3, 
                 email = $4, 
                 profile_image_url = $5, 
                 role = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE clerk_id = $1 
             RETURNING id`,
            [id, first_name, surname, email, avatar_url, role || 'student']
          );
          
          results.push({ id, action: 'updated' });
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        results,
        count: results.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error bulk creating/updating users:', err);
    res.status(500).json({ error: 'Failed to bulk create/update users' });
  }
}));

module.exports = router;
