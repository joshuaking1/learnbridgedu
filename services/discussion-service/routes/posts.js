// routes/posts.js
const express = require("express");
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get posts for a thread with pagination
router.get(
  "/thread/:threadId",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { threadId } = req.params;
    const { limit = 20, offset = 0, include_replies = true } = req.query;

    try {
      // Add debugging
      console.log("Fetching posts for thread:", threadId);

      // Modified query to use the existing users table schema
      let query = `
      SELECT p.*,
             COALESCE(CONCAT(u.first_name, ' ', u.surname), 'User ' || p.user_id) AS author_name,
             COALESCE(u.profile_image_url, '/default-avatar.png') AS avatar_url
      FROM posts p
      LEFT JOIN users u ON CAST(p.user_id AS VARCHAR) = u.clerk_id
    `;

      const queryParams = [parseInt(threadId, 10)];

      if (!include_replies || include_replies === "false") {
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
      query += ` LIMIT $${queryParams.push(
        parseInt(limit)
      )} OFFSET $${queryParams.push(parseInt(offset))}`;

      console.log("Executing query:", query);
      console.log("With params:", queryParams);

      const result = await db.query(query, queryParams);

      // Get reactions for each post in a separate query
      const postIds = result.rows.map((post) => post.id);

      if (postIds.length > 0) {
        const reactionsQuery = `
        SELECT post_id, reaction_type, COUNT(*) as count
        FROM post_reactions
        WHERE post_id = ANY($1)
        GROUP BY post_id, reaction_type
      `;

        const reactionsResult = await db.query(reactionsQuery, [postIds]);

        // Organize reactions by post_id
        const reactionsByPostId = {};
        reactionsResult.rows.forEach((reaction) => {
          if (!reactionsByPostId[reaction.post_id]) {
            reactionsByPostId[reaction.post_id] = [];
          }
          reactionsByPostId[reaction.post_id].push({
            type: reaction.reaction_type,
            count: parseInt(reaction.count),
          });
        });

        // Add reactions to each post
        result.rows.forEach((post) => {
          post.reactions = reactionsByPostId[post.id] || [];
        });
      }

      // Count total for pagination
      const countParams = [parseInt(threadId, 10)];
      let countQuery = "SELECT COUNT(*) FROM posts WHERE thread_id = $1";

      if (!include_replies || include_replies === "false") {
        countQuery += " AND parent_id IS NULL";
      }

      const countResult = await db.query(countQuery, countParams);

      res.json({
        posts: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (err) {
      console.error(`Error fetching posts for thread ${threadId}:`, err);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  })
);

// Create a new post
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { thread_id, user_id, content, parent_id } = req.body;

    // Validate required fields
    if (!thread_id || !user_id || !content) {
      return res
        .status(400)
        .json({ error: "Thread ID, user ID, and content are required" });
    }

    try {
      console.log("Creating new post:", {
        thread_id,
        user_id,
        content,
        parent_id,
      });

      // Insert the post
      const result = await db.query(
        `INSERT INTO posts (thread_id, user_id, content, parent_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, thread_id, user_id, content, parent_id, created_at, updated_at`,
        [thread_id, user_id, content, parent_id || null]
      );

      const newPost = result.rows[0];

      // Get user info for the post
      const userResult = await db.query(
        `SELECT COALESCE(CONCAT(first_name, ' ', surname), 'User ' || $1) AS author_name,
              COALESCE(profile_image_url, '/default-avatar.png') AS avatar_url
       FROM users
       WHERE clerk_id = $1`,
        [user_id]
      );

      if (userResult.rows.length > 0) {
        newPost.author_name = userResult.rows[0].author_name;
        newPost.avatar_url = userResult.rows[0].avatar_url;
      } else {
        newPost.author_name = `User ${user_id}`;
        newPost.avatar_url = "/default-avatar.png";
      }

      // Initialize empty reactions array
      newPost.reactions = [];

      console.log("Post created successfully:", newPost);

      res.status(201).json(newPost);
    } catch (err) {
      console.error("Error creating post:", err);
      res.status(500).json({ error: "Failed to create post" });
    }
  })
);

// Get post by ID with replies
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      // Get main post with user info
      const postResult = await db.query(
        `SELECT p.*,
              COALESCE(CONCAT(u.first_name, ' ', u.surname), 'User ' || p.user_id) AS author_name,
              COALESCE(u.profile_image_url, '/default-avatar.png') AS avatar_url
       FROM posts p
       LEFT JOIN users u ON CAST(p.user_id AS VARCHAR) = u.clerk_id
       WHERE p.id = $1`,
        [id]
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({ error: "Post not found" });
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

      // Get replies with user info
      const repliesResult = await db.query(
        `SELECT p.*,
              COALESCE(CONCAT(u.first_name, ' ', u.surname), 'User ' || p.user_id) AS author_name,
              COALESCE(u.profile_image_url, '/default-avatar.png') AS avatar_url
       FROM posts p
       LEFT JOIN users u ON CAST(p.user_id AS VARCHAR) = u.clerk_id
       WHERE p.parent_id = $1
       ORDER BY p.created_at ASC`,
        [id]
      );

      post.replies = repliesResult.rows;

      // Get attachments
      const attachmentsResult = await db.query(
        "SELECT * FROM post_attachments WHERE post_id = $1",
        [id]
      );

      post.attachments = attachmentsResult.rows;

      res.json(post);
    } catch (err) {
      console.error(`Error fetching post id ${id}:`, err);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  })
);

// Add or toggle a reaction to a post
router.post(
  "/:id/reactions",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { user_id, reaction_type } = req.body;

    // Validate required fields
    if (!user_id || !reaction_type) {
      return res
        .status(400)
        .json({ error: "User ID and reaction type are required" });
    }

    try {
      console.log(`Processing reaction for post ${id}:`, {
        user_id,
        reaction_type,
      });

      // Check if the post exists
      const postCheck = await db.query("SELECT id FROM posts WHERE id = $1", [
        id,
      ]);

      if (postCheck.rows.length === 0) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Check if the user has already reacted with this reaction type
      const existingReaction = await db.query(
        "SELECT id FROM post_reactions WHERE post_id = $1 AND user_id = $2 AND reaction_type = $3",
        [id, user_id, reaction_type]
      );

      if (existingReaction.rows.length > 0) {
        // User already reacted, so remove the reaction (toggle off)
        await db.query(
          "DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2 AND reaction_type = $3",
          [id, user_id, reaction_type]
        );

        console.log(
          `Removed reaction ${reaction_type} from post ${id} by user ${user_id}`
        );

        res.json({
          success: true,
          action: "removed",
          post_id: parseInt(id),
          user_id,
          reaction_type,
        });
      } else {
        // Add new reaction
        await db.query(
          "INSERT INTO post_reactions (post_id, user_id, reaction_type, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
          [id, user_id, reaction_type]
        );

        console.log(
          `Added reaction ${reaction_type} to post ${id} by user ${user_id}`
        );

        res.json({
          success: true,
          action: "added",
          post_id: parseInt(id),
          user_id,
          reaction_type,
        });
      }
    } catch (err) {
      console.error(`Error processing reaction for post ${id}:`, err);
      res.status(500).json({ error: "Failed to process reaction" });
    }
  })
);

// Update a post (mark as solution, edit content, etc.)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { content, is_solution } = req.body;

    try {
      // Check if the post exists
      const postCheck = await db.query(
        "SELECT id, thread_id FROM posts WHERE id = $1",
        [id]
      );

      if (postCheck.rows.length === 0) {
        return res.status(404).json({ error: "Post not found" });
      }

      const updateFields = [];
      const queryParams = [id];
      let paramCounter = 2;

      // Build dynamic update query based on provided fields
      if (content !== undefined) {
        updateFields.push(`content = $${paramCounter++}`);
        queryParams.push(content);
      }

      if (is_solution !== undefined) {
        updateFields.push(`is_solution = $${paramCounter++}`);
        queryParams.push(is_solution);

        // If marking as solution, unmark all other posts in the thread
        if (is_solution) {
          const threadId = postCheck.rows[0].thread_id;
          await db.query(
            "UPDATE posts SET is_solution = false WHERE thread_id = $1 AND id != $2",
            [threadId, id]
          );
        }
      }

      // Add updated_at timestamp
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      // Execute update
      const result = await db.query(
        `UPDATE posts SET ${updateFields.join(", ")} WHERE id = $1 RETURNING *`,
        queryParams
      );

      // Get user info for the updated post
      const updatedPost = result.rows[0];
      const userResult = await db.query(
        `SELECT COALESCE(CONCAT(first_name, ' ', surname), 'User ' || $1) AS author_name,
              COALESCE(profile_image_url, '/default-avatar.png') AS avatar_url
       FROM users
       WHERE clerk_id = $1`,
        [updatedPost.user_id]
      );

      if (userResult.rows.length > 0) {
        updatedPost.author_name = userResult.rows[0].author_name;
        updatedPost.avatar_url = userResult.rows[0].avatar_url;
      } else {
        updatedPost.author_name = `User ${updatedPost.user_id}`;
        updatedPost.avatar_url = "/default-avatar.png";
      }

      res.json(updatedPost);
    } catch (err) {
      console.error(`Error updating post ${id}:`, err);
      res.status(500).json({ error: "Failed to update post" });
    }
  })
);

module.exports = router;
