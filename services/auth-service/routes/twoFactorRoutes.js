// services/auth-service/routes/twoFactorRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const db = require("../db");
const twoFactorService = require("../services/twoFactorService");
const authenticateToken = require("../middleware/authenticateToken");
const logger = require("../logger");

// Get 2FA status (GET /api/auth/2fa/status)
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if 2FA is enabled for the user
    const result = await db.query(
      "SELECT two_factor_enabled FROM users WHERE id = $1",
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      is2FAEnabled: result.rows[0].two_factor_enabled,
    });
  } catch (err) {
    logger.error("Error getting 2FA status:", err);
    res
      .status(500)
      .json({ error: "Failed to get two-factor authentication status" });
  }
});

// Initialize 2FA (POST /api/auth/2fa/initialize)
router.post("/initialize", authenticateToken, async (req, res) => {
  logger.info(`[2FA Initialize] Received request for user ID: ${req.user?.userId}, email: ${req.user?.email}`);
  logger.info(`[2FA Initialize] Request headers:`, req.headers);
  
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    
    logger.info(`[2FA Initialize] Processing request for user ID: ${userId}, email: ${email}`);

    // Check if 2FA is already enabled
    const userResult = await db.query(
      "SELECT two_factor_enabled FROM users WHERE id = $1",
      [userId]
    );
    
    logger.info(`[2FA Initialize] User query result:`, userResult.rows);

    if (userResult.rows.length === 0) {
      logger.error(`[2FA Initialize] User not found with ID: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    if (userResult.rows[0]?.two_factor_enabled) {
      logger.info(`[2FA Initialize] 2FA already enabled for user ID: ${userId}`);
      return res.status(400).json({ error: "2FA is already enabled" });
    }

    // Initialize 2FA
    logger.info(`[2FA Initialize] Calling twoFactorService.initialize2FA for user ID: ${userId}`);
    const result = await twoFactorService.initialize2FA(userId, email);
    logger.info(`[2FA Initialize] 2FA initialization successful for user ID: ${userId}`);

    res.status(200).json({
      message: "Two-factor authentication initialized",
      ...result,
    });
  } catch (err) {
    logger.error(`[2FA Initialize] Failed for user ID: ${req.user?.userId}, email: ${req.user?.email}`);
    logger.error(`[2FA Initialize] Error details:`, err);
    res
      .status(500)
      .json({ error: "Failed to initialize two-factor authentication" });
  }
});

// Enable 2FA (POST /api/auth/2fa/enable)
router.post(
  "/enable",
  authenticateToken,
  [body("token").isLength({ min: 6, max: 6 }).isNumeric()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.user.userId;
      const { token } = req.body;

      // Verify token
      const isValid = await twoFactorService.verifyToken(
        userId,
        token,
        req.ip,
        req.headers["user-agent"] || "Unknown"
      );

      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Enable 2FA
      await twoFactorService.enable2FA(userId);

      res
        .status(200)
        .json({ message: "Two-factor authentication enabled successfully" });
    } catch (err) {
      logger.error("Error enabling 2FA:", err);
      res
        .status(500)
        .json({ error: "Failed to enable two-factor authentication" });
    }
  }
);

// Disable 2FA (POST /api/auth/2fa/disable)
router.post("/disable", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Disable 2FA
    await twoFactorService.disable2FA(userId);

    res
      .status(200)
      .json({ message: "Two-factor authentication disabled successfully" });
  } catch (err) {
    logger.error("Error disabling 2FA:", err);
    res
      .status(500)
      .json({ error: "Failed to disable two-factor authentication" });
  }
});

// Get Backup Codes Count (GET /api/auth/2fa/backup-codes/count)
router.get("/backup-codes/count", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await twoFactorService.getRemainingBackupCodes(userId);

    res.status(200).json({ count });
  } catch (err) {
    logger.error("Error getting backup codes count:", err);
    res.status(500).json({ error: "Failed to get backup codes count" });
  }
});

module.exports = router;
