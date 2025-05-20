// services/ai-service/routes/usageLimits.js
const express = require("express");
const usageLimitService = require("../services/usageLimitService");

const router = express.Router();

// --- Get User's Usage Limits ---
// GET /api/ai/limits
router.get("/", async (req, res) => {
  // TEMPORARY: Use mock user if req.user is undefined
  const user = req.user || {
    userId: "mock-user-123",
    role: "teacher",
  };

  console.log(`[AI Service] Request for usage limits from user ${user.userId}`);

  try {
    const usageStats = await usageLimitService.getUserUsageStats(user);
    res.status(200).json(usageStats);
  } catch (error) {
    console.error(
      `[AI Service] Error fetching usage limits for user ${user.userId}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Internal Server Error fetching usage limits." });
  }
});

module.exports = router;
