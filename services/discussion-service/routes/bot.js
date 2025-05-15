// routes/bot.js - LearnBridgeEdu Bot Integration
const express = require("express");
const router = express.Router();
const axios = require("axios");

// Error handling wrapper for async route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Process forum post with LearnBridgeEdu Bot
router.post(
  "/process-post",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { post_id } = req.body;

    if (!post_id) {
      return res.status(400).json({ error: "Post ID is required" });
    }

    try {
      // Retrieve the post content
      const postResult = await db.query(
        `SELECT p.*, t.title AS thread_title, t.id AS thread_id, f.name AS forum_name
       FROM posts p
       JOIN threads t ON p.thread_id = t.id
       JOIN forums f ON t.forum_id = f.id
       WHERE p.id = $1`,
        [post_id]
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({ error: "Post not found" });
      }

      const post = postResult.rows[0];

      // Check if this post should trigger the bot
      // Rules: Only respond to questions, posts with ? marks, or specific bot mentions
      const shouldRespond =
        post.content.includes("?") ||
        post.content.toLowerCase().includes("@learnbridgeedu") ||
        post.content.toLowerCase().includes("learnbridgeedu bot");

      if (!shouldRespond) {
        return res
          .status(200)
          .json({ message: "Post does not require bot response" });
      }

      // Connect to AI service to generate the response
      const aiServiceUrl =
        process.env.AI_SERVICE_URL || "http://localhost:3004";

      const botResponse = await axios.post(
        `${aiServiceUrl}/api/forum-bot/process`,
        {
          prompt: post.content,
          context: {
            thread_title: post.thread_title,
            forum_name: post.forum_name,
            post_id: post.id,
            thread_id: post.thread_id,
          },
        }
      );

      if (!botResponse.data || !botResponse.data.response) {
        throw new Error("Invalid response from AI service");
      }

      // Store the generated response in bot_responses table for analysis
      await db.query(
        "INSERT INTO bot_responses (post_id, prompt, response) VALUES ($1, $2, $3)",
        [post_id, post.content, botResponse.data.response]
      );

      // Create a new post from the bot
      const botUserId = process.env.BOT_USER_ID || "learnbridgeedu-bot";

      const botPostResult = await db.query(
        "INSERT INTO posts (thread_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING *",
        [post.thread_id, botUserId, botResponse.data.response, post.id]
      );

      const botPost = botPostResult.rows[0];

      // Update the thread's last activity timestamp
      await db.query(
        "UPDATE threads SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1",
        [post.thread_id]
      );

      // Emit websocket event for the new bot post
      req.app
        .get("io")
        .to(`thread:${post.thread_id}`)
        .emit("newPost", {
          ...botPost,
          author_name: "LearnBridgeEdu Bot",
          avatar_url: "/images/learnbridge-bot-avatar.png",
        });

      res.status(201).json({
        success: true,
        bot_post_id: botPost.id,
        response: botResponse.data.response,
      });
    } catch (err) {
      console.error(`Error processing post ${post_id} with bot:`, err);
      res.status(500).json({ error: "Failed to process post with bot" });
    }
  })
);

// Get AI-suggested learning resources based on thread content
router.get(
  "/learning-resources/:threadId",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { threadId } = req.params;

    try {
      console.log(`Fetching learning resources for thread ${threadId}`);

      // Get thread title and posts
      const threadResult = await db.query(
        "SELECT title FROM threads WHERE id = $1",
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const thread = threadResult.rows[0];

      // Get post contents
      const postsResult = await db.query(
        "SELECT content FROM posts WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 10",
        [threadId]
      );

      // Combine thread title and post contents for context
      const threadContext = {
        title: thread.title,
        posts: postsResult.rows.map((p) => p.content),
      };

      // Request AI service to suggest learning resources
      const aiServiceUrl =
        process.env.AI_SERVICE_URL || "http://localhost:3004";

      try {
        const aiResponse = await axios.post(
          `${aiServiceUrl}/api/forum-bot/learning-resources`,
          {
            context: threadContext,
          }
        );

        if (!aiResponse.data || !aiResponse.data.resources) {
          throw new Error("Invalid response from AI service");
        }

        console.log("Received learning resources from AI service");
        res.json(aiResponse.data.resources);
      } catch (aiError) {
        console.error("Error connecting to AI service:", aiError.message);

        // Fallback to default resources if AI service is unavailable
        res.status(500).json({ error: "AI service unavailable" });
      }
    } catch (err) {
      console.error(
        `Error getting learning resources for thread ${threadId}:`,
        err
      );
      res.status(500).json({ error: "Failed to get learning resources" });
    }
  })
);

// Get concept summary for a thread
router.get(
  "/concept-summary/:threadId",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const { threadId } = req.params;

    try {
      console.log(`Fetching concept summary for thread ${threadId}`);

      // Get all post content from the thread
      const result = await db.query(
        `SELECT t.title, array_agg(p.content) AS post_contents
       FROM threads t
       JOIN posts p ON t.id = p.thread_id
       WHERE t.id = $1
       GROUP BY t.id, t.title`,
        [threadId]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Thread not found or has no posts" });
      }

      const threadData = result.rows[0];

      // Request AI service to generate a concept summary
      const aiServiceUrl =
        process.env.AI_SERVICE_URL || "http://localhost:3004";

      try {
        const aiResponse = await axios.post(
          `${aiServiceUrl}/api/forum-bot/concept-summary`,
          {
            context: {
              title: threadData.title,
              content: threadData.post_contents.join("\n\n"),
            },
          }
        );

        if (!aiResponse.data || !aiResponse.data.summary) {
          throw new Error("Invalid response from AI service");
        }

        console.log("Received concept summary from AI service");
        res.json({
          thread_id: threadId,
          thread_title: threadData.title,
          summary: aiResponse.data.summary,
          key_concepts: aiResponse.data.key_concepts || [],
          generated_at: new Date().toISOString(),
        });
      } catch (aiError) {
        console.error("Error connecting to AI service:", aiError.message);

        // Fallback to mock summary if AI service is unavailable
        res.status(500).json({ error: "AI service unavailable" });
      }
    } catch (err) {
      console.error(
        `Error generating concept summary for thread ${threadId}:`,
        err
      );
      res.status(500).json({ error: "Failed to generate concept summary" });
    }
  })
);

// Check for unanswered questions and suggest bot assistance
router.get(
  "/find-unanswered",
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;

    try {
      // Find posts that are likely questions but have no replies
      const result = await db.query(`
      SELECT p.id, p.content, p.thread_id, t.title AS thread_title, p.created_at
      FROM posts p
      JOIN threads t ON p.thread_id = t.id
      WHERE
        p.content LIKE '%?%' AND
        NOT EXISTS (SELECT 1 FROM posts p2 WHERE p2.parent_id = p.id) AND
        p.created_at < NOW() - INTERVAL '30 minutes' AND
        p.created_at > NOW() - INTERVAL '7 days'
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

      res.json(result.rows);
    } catch (err) {
      console.error("Error finding unanswered questions:", err);
      res.status(500).json({ error: "Failed to find unanswered questions" });
    }
  })
);

module.exports = router;
