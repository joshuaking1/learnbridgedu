// routes/forums.js
const express = require('express');
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get all forums
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  
  try {
    const result = await db.query(
      'SELECT * FROM forums WHERE is_active = true ORDER BY sort_order, name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching forums:', err);
    res.status(500).json({ error: 'Failed to fetch forums' });
  }
}));

// Get forum by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  try {
    // Log the request parameters for debugging
    console.log(`Fetching forum with ID: ${id} (parsed as ${parseInt(id, 10)})`);
    
    const result = await db.query(
      'SELECT * FROM forums WHERE id = $1 AND is_active = true',
      [parseInt(id, 10)]
    );
    
    // Log the query result for debugging
    console.log(`Forum query result: ${result.rows.length} rows found`);
    if (result.rows.length > 0) {
      console.log(`Forum data: ${JSON.stringify(result.rows[0], null, 2)}`);
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Forum not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching forum id ${id}:`, err);
    res.status(500).json({ error: 'Failed to fetch forum' });
  }
}));

// Create a new forum (admin only)
router.post('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { name, description, category, sort_order } = req.body;
  
  // Validate required fields
  if (!name) {
    return res.status(400).json({ error: 'Forum name is required' });
  }
  
  try {
    const result = await db.query(
      'INSERT INTO forums (name, description, category, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, category, sort_order || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating forum:', err);
    res.status(500).json({ error: 'Failed to create forum' });
  }
}));

// Update forum
router.put('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, description, category, sort_order, is_active } = req.body;
  
  try {
    // First check if forum exists
    const checkResult = await db.query('SELECT id FROM forums WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Forum not found' });
    }
    
    const result = await db.query(
      `UPDATE forums 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           category = COALESCE($3, category), 
           sort_order = COALESCE($4, sort_order), 
           is_active = COALESCE($5, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 
       RETURNING *`,
      [name, description, category, sort_order, is_active, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating forum id ${id}:`, err);
    res.status(500).json({ error: 'Failed to update forum' });
  }
}));

// Delete forum (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  try {
    // Soft delete by setting is_active to false
    const result = await db.query(
      'UPDATE forums SET is_active = false WHERE id = $1 RETURNING id', 
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Forum not found' });
    }
    
    res.json({ message: 'Forum deleted successfully' });
  } catch (err) {
    console.error(`Error deleting forum id ${id}:`, err);
    res.status(500).json({ error: 'Failed to delete forum' });
  }
}));

module.exports = router;
