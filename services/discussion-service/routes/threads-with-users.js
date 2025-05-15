// routes/threads.js
const express = require('express');
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get all threads with optional forum filter
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { forum_id, limit, offset, sort } = req.query;
  
  try {
    // Modified query to use the users table
    let query = `
      SELECT t.*, 
             COUNT(p.id) AS post_count, 
             COALESCE(MAX(p.created_at), t.created_at) AS last_activity, 
             COALESCE(u.name, 'User ' || t.user_id) AS author_name,
             (SELECT COUNT(*) FROM post_reactions pr JOIN posts p2 ON pr.post_id = p2.id WHERE p2.thread_id = t.id) AS reaction_count
      FROM threads t
      LEFT JOIN posts p ON t.id = p.thread_id
      LEFT JOIN users u ON t.user_id = u.id
    `;
    
    const queryParams = [];
    let whereClause = [];
    
    if (forum_id) {
      queryParams.push(parseInt(forum_id, 10));
      whereClause.push(`t.forum_id = $${queryParams.length}`);
    }
    
    if (whereClause.length > 0) {
      query += ` WHERE ${whereClause.join(' AND ')}`;
    }
    
    query += ` GROUP BY t.id, u.name, u.id`;
    
    // Sorting
    const sortOptions = {
      newest: 't.created_at DESC',
      oldest: 't.created_at ASC',
      active: 'last_activity DESC',
      popular: 't.view_count DESC',
      engaging: 'reaction_count DESC'
    };
    
    query += ` ORDER BY ${sortOptions[sort] || 'last_activity DESC'}`;
    
    // Pagination
    if (limit) {
      queryParams.push(parseInt(limit));
      query += ` LIMIT $${queryParams.length}`;
      
      if (offset) {
        queryParams.push(parseInt(offset));
        query += ` OFFSET $${queryParams.length}`;
      }
    }
    
    console.log('Executing threads query:', query);
    console.log('With params:', queryParams);
    
    const result = await db.query(query, queryParams);
    
    // Get total threads count for pagination
    let countQuery = 'SELECT COUNT(*) FROM threads t';
    if (whereClause.length > 0) {
      countQuery += ` WHERE ${whereClause.join(' AND ')}`;
    }
    
    const countResult = await db.query(countQuery, queryParams.filter((_, i) => i < whereClause.length));
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      threads: result.rows,
      total: totalCount,
      limit: limit ? parseInt(limit) : null,
      offset: offset ? parseInt(offset) : 0
    });
  } catch (err) {
    console.error('Error fetching threads:', err);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
}));

// Get thread by ID with posts
router.get('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  try {
    // Convert id to integer and log for debugging
    const threadId = parseInt(id, 10);
    console.log(`Fetching thread with ID: ${id} (parsed as ${threadId})`);
    
    // Get thread details with debug output
    console.log('Running thread query with ID:', threadId);
    
    // Modified query to use the users table
    const threadResult = await db.query(
      `SELECT t.*, f.name AS forum_name, 
              COALESCE(u.name, 'User ' || t.user_id) AS author_name
       FROM threads t 
       JOIN forums f ON t.forum_id = f.id 
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = $1`,
      [threadId]
    );
    
    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    
    const thread = threadResult.rows[0];
    
    // Update view count atomically
    await db.query(
      'UPDATE threads SET view_count = view_count + 1 WHERE id = $1',
      [id]
    );
    
    // Get tags for this thread
    const tagsResult = await db.query(
      'SELECT tag_name FROM thread_tags WHERE thread_id = $1',
      [id]
    );
    
    thread.tags = tagsResult.rows.map(row => row.tag_name);
    
    res.json(thread);
  } catch (err) {
    console.error(`Error fetching thread id ${id}:`, err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
}));

module.exports = router;
