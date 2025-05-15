// routes/users.js
const express = require("express");
const router = express.Router();

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Get user by ID
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const result = await db.query(
        `SELECT id, first_name, surname, email, profile_image_url, role, created_at, updated_at, clerk_id,
              bio, location, website
       FROM users
       WHERE clerk_id = $1 OR id = $2`,
        [id, parseInt(id, 10)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
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
        bio: user.bio || "",
        location: user.location || "",
        website: user.website || "",
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      res.json(formattedUser);
    } catch (err) {
      console.error(`Error fetching user id ${id}:`, err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  })
);

// Create or update user from Clerk
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id, first_name, last_name, email, avatar_url, role } = req.body;

    // Validate required fields
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      // Check if user exists by clerk_id
      const checkResult = await db.query(
        "SELECT id FROM users WHERE clerk_id = $1",
        [id]
      );

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
            first_name || "",
            last_name || "",
            email,
            avatar_url,
            role || "student",
            id,
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
          updated_at: user.updated_at,
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
          [
            id,
            first_name || "",
            last_name || "",
            email,
            avatar_url,
            role || "student",
          ]
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
          updated_at: user.updated_at,
        };

        res.json(formattedUser);
      }
    } catch (err) {
      console.error("Error creating/updating user:", err);
      res.status(500).json({ error: "Failed to create/update user" });
    }
  })
);

// Bulk create or update users
router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { users } = req.body;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: "Users array is required" });
    }

    try {
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const results = [];

        for (const user of users) {
          const { id, name, email, avatar_url, role } = user;

          if (!id) {
            continue; // Skip invalid users
          }

          // Split name into first_name and surname
          const nameParts = name ? name.split(" ") : ["", ""];
          const first_name = nameParts[0] || "";
          const surname = nameParts.slice(1).join(" ") || "";

          // Check if user exists
          const checkResult = await client.query(
            "SELECT id FROM users WHERE clerk_id = $1",
            [id]
          );

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
              [first_name, surname, email, avatar_url, role || "student", id]
            );

            results.push({ id, action: "created" });
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
              [id, first_name, surname, email, avatar_url, role || "student"]
            );

            results.push({ id, action: "updated" });
          }
        }

        await client.query("COMMIT");

        res.json({
          success: true,
          results,
          count: results.length,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error bulk creating/updating users:", err);
      res.status(500).json({ error: "Failed to bulk create/update users" });
    }
  })
);

// Get user profile with activity stats
router.get(
  "/:id/profile",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      console.log(`Fetching user profile for user ${id}`);

      // Get user information from the users table
      const userResult = await db.query(
        `SELECT id, clerk_id, first_name, surname, email, profile_image_url, role,
              created_at, updated_at, bio, location, website
       FROM users
       WHERE clerk_id = $1 OR id = $2`,
        [id, parseInt(id, 10)]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userResult.rows[0];

      // Get user activity statistics
      const statsResult = await db.query(
        `SELECT
         (SELECT COUNT(*) FROM posts WHERE user_id = $1) AS post_count,
         (SELECT COUNT(*) FROM threads WHERE user_id = $1) AS thread_count,
         (SELECT COUNT(*) FROM post_reactions WHERE user_id = $1) AS reaction_count,
         (SELECT COUNT(*) FROM posts WHERE user_id = $1 AND is_solution = true) AS solution_count
       `,
        [user.clerk_id]
      );

      const stats = statsResult.rows[0];

      // Get recent activity (posts, threads)
      const recentPostsResult = await db.query(
        `SELECT p.id, p.content, p.created_at, p.thread_id, t.title AS thread_title
       FROM posts p
       JOIN threads t ON p.thread_id = t.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT 5`,
        [user.clerk_id]
      );

      const recentThreadsResult = await db.query(
        `SELECT t.id, t.title, t.created_at, f.name AS forum_name, f.id AS forum_id
       FROM threads t
       JOIN forums f ON t.forum_id = f.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 5`,
        [user.clerk_id]
      );

      // Combine all data into a user profile object
      const userProfile = {
        id: user.id,
        clerk_id: user.clerk_id,
        name: `${user.first_name} ${user.surname}`.trim(),
        email: user.email,
        avatar_url: user.profile_image_url,
        role: user.role,
        bio: user.bio || "",
        location: user.location || "",
        website: user.website || "",
        created_at: user.created_at,
        updated_at: user.updated_at,
        stats,
        recent_activity: {
          posts: recentPostsResult.rows,
          threads: recentThreadsResult.rows,
        },
      };

      res.json(userProfile);
    } catch (err) {
      console.error(`Error fetching user profile for ${id}:`, err);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  })
);

// Update user profile details
router.put(
  "/:id/profile",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { bio, location, website } = req.body;

    try {
      console.log(`Updating user profile for user ${id}`);

      // Check if user exists
      const userCheck = await db.query(
        "SELECT id, clerk_id FROM users WHERE clerk_id = $1 OR id = $2",
        [id, parseInt(id, 10)]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userCheck.rows[0];

      // Update user profile
      const updateResult = await db.query(
        `UPDATE users
       SET bio = $1, location = $2, website = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, clerk_id, first_name, surname, email, profile_image_url, role, bio, location, website, created_at, updated_at`,
        [bio, location, website, user.id]
      );

      // Format the response
      const updatedUser = updateResult.rows[0];
      const formattedUser = {
        id: updatedUser.id,
        clerk_id: updatedUser.clerk_id,
        name: `${updatedUser.first_name} ${updatedUser.surname}`.trim(),
        email: updatedUser.email,
        avatar_url: updatedUser.profile_image_url,
        role: updatedUser.role,
        bio: updatedUser.bio || "",
        location: updatedUser.location || "",
        website: updatedUser.website || "",
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at,
      };

      res.json(formattedUser);
    } catch (err) {
      console.error(`Error updating user profile for ${id}:`, err);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  })
);

// Get user activity
router.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { page = 1, limit = 20, type } = req.query;

    try {
      console.log(`Fetching user activity for user ${id}`);

      // Check if user exists
      const userCheck = await db.query(
        "SELECT id, clerk_id FROM users WHERE clerk_id = $1 OR id = $2",
        [id, parseInt(id, 10)]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = userCheck.rows[0];
      const offset = (page - 1) * limit;
      let activityQuery;
      let queryParams;

      // Filter by activity type if specified
      if (type === "posts") {
        activityQuery = `
        SELECT 'post' AS activity_type, p.id, p.content, p.created_at,
               t.id AS thread_id, t.title AS thread_title, f.id AS forum_id, f.name AS forum_name
        FROM posts p
        JOIN threads t ON p.thread_id = t.id
        JOIN forums f ON t.forum_id = f.id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `;
        queryParams = [user.clerk_id, limit, offset];
      } else if (type === "threads") {
        activityQuery = `
        SELECT 'thread' AS activity_type, t.id, t.title, t.created_at,
               f.id AS forum_id, f.name AS forum_name
        FROM threads t
        JOIN forums f ON t.forum_id = f.id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `;
        queryParams = [user.clerk_id, limit, offset];
      } else {
        // Get all activity types
        activityQuery = `
        (SELECT 'post' AS activity_type, p.id, p.content AS title, p.created_at,
                t.id AS thread_id, t.title AS thread_title, f.id AS forum_id, f.name AS forum_name
         FROM posts p
         JOIN threads t ON p.thread_id = t.id
         JOIN forums f ON t.forum_id = f.id
         WHERE p.user_id = $1)
        UNION ALL
        (SELECT 'thread' AS activity_type, t.id, t.title, t.created_at,
                t.id AS thread_id, t.title AS thread_title, f.id AS forum_id, f.name AS forum_name
         FROM threads t
         JOIN forums f ON t.forum_id = f.id
         WHERE t.user_id = $1)
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
        queryParams = [user.clerk_id, limit, offset];
      }

      const activityResult = await db.query(activityQuery, queryParams);

      // Get total count for pagination
      const countQuery =
        type === "posts"
          ? "SELECT COUNT(*) FROM posts WHERE user_id = $1"
          : type === "threads"
          ? "SELECT COUNT(*) FROM threads WHERE user_id = $1"
          : `
          SELECT
            (SELECT COUNT(*) FROM posts WHERE user_id = $1) +
            (SELECT COUNT(*) FROM threads WHERE user_id = $1) AS total
          `;

      const countResult = await db.query(countQuery, [user.clerk_id]);
      const totalCount =
        countResult.rows[0].count || countResult.rows[0].total || 0;

      res.json({
        activities: activityResult.rows,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCount / limit),
        },
      });
    } catch (err) {
      console.error(`Error fetching user activity for ${id}:`, err);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  })
);

module.exports = router;
