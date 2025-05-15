// routes/posts.js
const express = require('express');
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get posts for a thread with pagination
router.get('/thread/:threadId', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { threadId } = req.params;
  const { limit = 20, offset = 0, include_replies = true } = req.query;
  
  try {
    // Add debugging
    console.log('Fetching posts for thread:', threadId);
    
    // Modified query to avoid user table join issues
    // We'll use a simpler query that doesn't rely on the users table
    let query = `
      SELECT p.*, 
             'User ' || p.user_id AS author_name, 
             '/default-avatar.png' AS avatar_url,
             (SELECT json_agg(json_build_object('type', pr.reaction_type, 'count', COUNT(*))) 
              FROM post_reactions pr 
              WHERE pr.post_id = p.id 
              GROUP BY pr.post_id, pr.reaction_type) AS reactions
      FROM posts p
    `;
    
    const queryParams = [parseInt(threadId, 10)];
    
    if (!include_replies || include_replies === 'false') {
      query += ` WHERE p.thread_id = $1 AND p.parent_id IS NULL`;
    } else {
      query += ` WHERE p.thread_id = $1`;
    }
    
    query += ` ORDER BY 
                CASE WHEN p.parent_id IS NULL THEN p.created_at ELSE 
                  (SELECT created_at FROM posts WHERE id = p.parent_id) 
                END ASC,
                p.parent_id NULLS FIRST,
                p.created_at ASC`;
    
    // Add pagination
    query += ` LIMIT $${queryParams.push(parseInt(limit))} OFFSET $${queryParams.push(parseInt(offset))}`;
    
    console.log('Executing query:', query);
    console.log('With params:', queryParams);
    
    const result = await db.query(query, queryParams);
    
    // Count total for pagination
    const countParams = [parseInt(threadId, 10)];
    let countQuery = 'SELECT COUNT(*) FROM posts WHERE thread_id = $1';
    
    if (!include_replies || include_replies === 'false') {
      countQuery += ' AND parent_id IS NULL';
    }
    
    const countResult = await db.query(countQuery, countParams);
    
    res.json({
      posts: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error(`Error fetching posts for thread ${threadId}:`, err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}));

// Get post by ID with replies
router.get('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  try {
    // Get main post - simplified to avoid users table join
    const postResult = await db.query(
      `SELECT p.*, 
              'User ' || p.user_id AS author_name, 
              '/default-avatar.png' AS avatar_url
       FROM posts p
       WHERE p.id = $1`,
      [id]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const post = postResult.rows[0];
    
    // Get reactions
    const reactionsResult = await db.query(
      `SELECT reaction_type, COUNT(*) as count 
       FROM post_reactions 
       WHERE post_id = $1 
       GROUP BY reaction_type`,
      [id]
    );
    
    post.reactions = reactionsResult.rows;
    
    // Get replies if this is a parent post - simplified to avoid users table join
    const repliesResult = await db.query(
      `SELECT p.*, 
              'User ' || p.user_id AS author_name, 
              '/default-avatar.png' AS avatar_url
       FROM posts p
       WHERE p.parent_id = $1
       ORDER BY p.created_at ASC`,
      [id]
    );
    
    post.replies = repliesResult.rows;
    
    // Get attachments
    const attachmentsResult = await db.query(
      'SELECT * FROM post_attachments WHERE post_id = $1',
      [id]
    );
    
    post.attachments = attachmentsResult.rows;
    
    res.json(post);
  } catch (err) {
    console.error(`Error fetching post id ${id}:`, err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
}));

module.exports = router;
