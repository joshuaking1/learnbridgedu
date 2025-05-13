// services/auth-service/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto"); // For generating reset tokens
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator"); // Import express-validator
const rateLimit = require("express-rate-limit"); // Import express-rate-limit
const db = require("./db"); // Import db connection
const authenticateToken = require("./middleware/authenticateToken"); // Import auth middleware
const logger = require("./logger"); // Import Winston logger
const { sendPasswordResetEmail } = require("./emailService"); // Import email service
const config = require("./config"); // Import config
const accountLockoutService = require("./services/accountLockoutService"); // Import account lockout service
const twoFactorService = require("./services/twoFactorService"); // Import 2FA service
const twoFactorRoutes = require("./routes/twoFactorRoutes"); // Import 2FA routes
const loginHistoryRoutes = require("./routes/loginHistoryRoutes"); // Import login history routes

const app = express();
const PORT = config.port; // Use port from config

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://app.learnbridgedu.com",
  "https://learnbridgedu.com",
];

// Only add FRONTEND_URL if it's defined and valid
if (process.env.FRONTEND_URL && 
    (process.env.FRONTEND_URL.startsWith('http://') || 
     process.env.FRONTEND_URL.startsWith('https://'))) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
logger.info("CORS configured with origins:", allowedOrigins);
app.use(cors(corsOptions));

app.use(helmet());
// app.use(morgan('dev')); // Replaced by Winston logger stream if HTTP logging is desired
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rate Limiting --- Apply before routes
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.login.windowMs,
  max: config.rateLimit.login.max,
  message: config.rateLimit.login.message,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
});

const registerLimiter = rateLimit({
  windowMs: config.rateLimit.register.windowMs,
  max: config.rateLimit.register.max,
  message: config.rateLimit.register.message,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
});

// Simple Route for Testing
// Enhanced health check with warmup status
let isWarmedUp = false;
let lastWarmupTime = null;

app.get("/api/auth/health", async (req, res) => {
  try {
    // Test DB connection
    const dbConnected = await db.query("SELECT 1");

    // Check core service readiness
    const serviceReady = dbConnected && isWarmedUp;

    // Auto-warmup on health check
    if (
      !isWarmedUp ||
      (lastWarmupTime && Date.now() - lastWarmupTime > 5 * 60 * 1000)
    ) {
      // Warm up connection pool and cache
      await db.query("SELECT COUNT(*) FROM users LIMIT 1");
      isWarmedUp = true;
      lastWarmupTime = Date.now();
    }

    res.status(200).json({
      status: "Auth Service is Up!",
      ready: serviceReady,
      warmedUp: isWarmedUp,
      lastWarmup: lastWarmupTime,
      checks: {
        database: !!dbConnected,
        cache: isWarmedUp,
      },
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "Auth Service is Up but not ready!",
      ready: false,
      error: error.message,
    });
  }
});

// Warmup endpoint
app.post("/api/auth/warmup", async (req, res) => {
  try {
    // Warm up connection pool
    await db.query("SELECT COUNT(*) FROM users LIMIT 1");

    // Update warmup status
    isWarmedUp = true;
    lastWarmupTime = Date.now();

    res.status(200).json({
      status: "Warmup successful",
      warmedUp: true,
      lastWarmup: lastWarmupTime,
    });
  } catch (error) {
    logger.error("Warmup failed:", error);
    res.status(500).json({
      status: "Warmup failed",
      error: error.message,
    });
  }
});

// Mount 2FA routes
app.use("/api/auth/2fa", twoFactorRoutes);

// Mount login history routes
app.use("/api/auth/login-history", loginHistoryRoutes);

// --- Auth Routes --- Apply rate limiters

// Register User (POST /api/auth/register)
app.post(
  "/api/auth/register",
  registerLimiter,
  [
    // Apply register limiter
    // Validation rules
    body("firstName").trim().notEmpty().withMessage("First name is required."),
    body("surname").trim().notEmpty().withMessage("Surname is required."),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address."),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long.")
      .matches(/\d/)
      .withMessage("Password must contain a number.")
      .matches(/[a-z]/)
      .withMessage("Password must contain a lowercase letter.")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter.")
      .matches(/[^a-zA-Z\d]/)
      .withMessage("Password must contain a special character."),
    // Optional fields validation (if needed, add more rules)
    body("school").optional().trim(),
    body("location").optional().trim(),
    body("position").optional().trim(),
    body("phone")
      .optional()
      .isMobilePhone("any")
      .withMessage("Invalid phone number format."),
    body("gender")
      .optional()
      .isIn(["Male", "Female", "Other", "Prefer not to say"])
      .withMessage("Invalid gender value."),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName,
      surname,
      school,
      location,
      position,
      email,
      phone,
      gender,
      password,
    } = req.body;

    try {
      // 1. Check if user already exists
      const userExists = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      if (userExists.rows.length > 0) {
        return res
          .status(400)
          .json({ error: "User with this email already exists." });
      }

      // 2. Hash the password
      const salt = await bcrypt.genSalt(config.bcryptSaltRounds); // Use salt rounds from config
      const hashedPassword = await bcrypt.hash(password, salt); // Hash password

      // 3. Insert new user into the database (Assumes 'users' table exists)
      // We need to coordinate this potentially with the User Service or have the table structure defined.
      // For now, let's assume the Auth service can write the core user details needed for auth.
      const newUserQuery = `
            INSERT INTO users (first_name, surname, school, location, position, email, phone, gender, password_hash, role)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, email, role, first_name;
        `;
      // Default role could be 'student' or 'teacher' based on 'position' or another field
      const defaultRole = position === "Teacher" ? "teacher" : "student"; // Basic example
      const values = [
        firstName,
        surname,
        school,
        location,
        position,
        email,
        phone,
        gender,
        hashedPassword,
        defaultRole,
      ];

      const result = await db.query(newUserQuery, values);
      const newUser = result.rows[0];

      // 4. Generate JWT Token (Optional: maybe login immediately after register)
      // const token = jwt.sign(
      //     { userId: newUser.id, email: newUser.email, role: newUser.role },
      //     process.env.JWT_SECRET,
      //     { expiresIn: process.env.JWT_EXPIRES_IN }
      // );

      // 5. Send Response (without token initially, require login)
      res.status(201).json({
        message: "User registered successfully. Please log in.",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          role: newUser.role,
        },
        // token: token // Uncomment if you want auto-login
      });
    } catch (err) {
      logger.error("Registration Error:", err);
      // Check for specific DB errors if needed (e.g., unique constraint violation)
      res
        .status(500)
        .json({ error: "Internal Server Error during registration." });
    }
  }
);

// Login User (POST /api/auth/login)
app.post(
  "/api/auth/login",
  loginLimiter,
  [
    // Apply login limiter
    // Validation rules
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address."),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // 1. Find user by email
      const result = await db.query(
        "SELECT id, email, password_hash, role, first_name FROM users WHERE email = $1",
        [email]
      );
      const user = result.rows[0];

      if (!user) {
        // Record failed login attempt for non-existent user (for security monitoring)
        await db.query(
          `INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
                 VALUES ($1, $2, $3, FALSE, $4)`,
          [
            email,
            req.ip,
            req.headers["user-agent"] || "Unknown",
            "User not found",
          ]
        );

        // Use the same error message and delay as invalid password to prevent user enumeration
        await new Promise((resolve) => setTimeout(resolve, 300)); // Add a small delay to prevent timing attacks
        return res.status(401).json({ error: "Invalid credentials." }); // User not found
      }

      // 1.5 Check if account is locked
      const { isLocked, remainingTime } =
        await accountLockoutService.isAccountLocked(user.id);
      if (isLocked) {
        logger.warn(
          `Login attempt for locked account: ${user.email} (${user.id})`
        );

        // Calculate remaining lockout time in minutes (rounded up)
        const remainingMinutes = remainingTime
          ? Math.ceil(remainingTime / 60000)
          : null;
        const lockoutMessage = remainingMinutes
          ? `Account is locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`
          : "Account is locked due to too many failed attempts. Contact support for assistance.";

        return res.status(401).json({ error: lockoutMessage });
      }

      // 2. Compare submitted password with stored hash
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        // Record failed login attempt and potentially lock the account
        const { accountLocked, lockoutUntil } =
          await accountLockoutService.recordFailedLoginAttempt(
            user.id,
            email,
            req.ip,
            req.headers["user-agent"] || "Unknown",
            "Invalid password"
          );

        if (accountLocked) {
          // Calculate lockout time in minutes (rounded up)
          const lockoutMinutes = Math.ceil(
            config.accountLockout.lockoutDuration / 60000
          );
          return res.status(401).json({
            error: `Account locked due to too many failed attempts. Try again in ${lockoutMinutes} minute(s).`,
          });
        }

        return res.status(401).json({ error: "Invalid credentials." }); // Password incorrect
      }

      // 3. Check if 2FA is enabled
      if (user.two_factor_enabled) {
        // Generate a temporary token for 2FA verification
        const tempToken = crypto.randomBytes(32).toString("hex");
        const hashedTempToken = crypto
          .createHash("sha256")
          .update(tempToken)
          .digest("hex");
        const expiresAt = new Date(Date.now() + config.twoFactor.tokenExpiry);

        // Store temporary token
        await db.query(
          `INSERT INTO two_factor_tokens (user_id, token_hash, expires_at)
                 VALUES ($1, $2, $3)`,
          [user.id, hashedTempToken, expiresAt]
        );

        // Return temporary token and user info
        return res.status(200).json({
          message: "2FA verification required",
          requires2FA: true,
          tempToken: tempToken,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
          },
        });
      }

      // If 2FA is not enabled, generate JWT Token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role }, // Payload: Data stored in the token
        config.jwt.secret, // Use secret from config
        { expiresIn: config.jwt.expiresIn } // Use expiration from config
      );

      // 4. Record login session and activity
      try {
        // Update or create user session
        const sessionQuery = `
                INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, is_online, last_login, last_activity)
                VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET
                    session_token = $2,
                    ip_address = $3,
                    user_agent = $4,
                    is_online = TRUE,
                    last_login = NOW(),
                    last_activity = NOW(),
                    updated_at = NOW()
            `;

        await db.query(sessionQuery, [
          user.id,
          token,
          req.ip,
          req.headers["user-agent"] || "Unknown",
        ]);

        // Log the login activity
        const logQuery = `
                INSERT INTO user_activity_logs (user_id, action, details, ip_address)
                VALUES ($1, $2, $3, $4)
            `;

        await db.query(logQuery, [
          user.id,
          "login",
          "User logged in successfully",
          req.ip,
        ]);

        logger.info(`[Auth Service] Login recorded for user ${user.id}`);

        // Record successful login and reset failed attempts counter
        await accountLockoutService.recordSuccessfulLogin(
          user.id,
          email,
          req.ip,
          req.headers["user-agent"] || "Unknown"
        );
      } catch (sessionErr) {
        // Don't fail the login if session recording fails, just log the error
        logger.error(
          "[Auth Service] Error recording login session:",
          sessionErr
        );
      }

      // 5. Send Token and User Info back
      res.status(200).json({
        message: "Login successful",
        token: token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          role: user.role,
        },
      });
    } catch (err) {
      logger.error("Login Error:", err);
      res.status(500).json({ error: "Internal Server Error during login." });
    }
  }
);

// Refresh Token (POST /api/auth/refresh-token)
app.post("/api/auth/refresh-token", authenticateToken, async (req, res) => {
  // This endpoint requires a valid token to refresh it
  // The authenticateToken middleware will verify the token and add the user to req.user

  try {
    // Get user ID from the token payload (added by authenticateToken middleware)
    const userId = req.user.userId;
    const userEmail = req.user.email;
    const userRole = req.user.role;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Verify that the user still exists in the database
    const result = await db.query(
      "SELECT id, email, role, first_name FROM users WHERE id = $1",
      [userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate a new token with a new expiration time
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret, // Use secret from config
      { expiresIn: config.jwt.expiresIn } // Use expiration from config
    );

    // Return the new token
    res.status(200).json({
      message: "Token refreshed successfully",
      token: newToken,
    });
  } catch (err) {
    logger.error("Token refresh error:", err);
    res
      .status(500)
      .json({ error: "Internal server error during token refresh" });
  }
});

// Logout (POST /api/auth/logout)
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    logger.info(`[Auth Service] Logout requested for user: ${userId}`);

    // Update user session to mark as offline
    const sessionQuery = `
            UPDATE user_sessions
            SET is_online = FALSE, updated_at = NOW()
            WHERE user_id = $1
        `;

    await db.query(sessionQuery, [userId]);

    // Log the logout activity
    const logQuery = `
            INSERT INTO user_activity_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `;

    await db.query(logQuery, [userId, "logout", "User logged out", req.ip]);

    res.status(200).json({ message: "Logout successful" });
  } catch (err) {
    logger.error("[Auth Service] Logout Error:", err);
    res.status(500).json({ error: "Internal server error during logout" });
  }
});

// --- Password Reset Routes ---

// Request Password Reset (POST /api/auth/forgot-password)
const forgotPasswordLimiter = rateLimit({
  windowMs: config.rateLimit.forgotPassword.windowMs,
  max: config.rateLimit.forgotPassword.max,
  message: config.rateLimit.forgotPassword.message,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
});

app.post(
  "/api/auth/forgot-password",
  forgotPasswordLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const frontendUrl = config.frontendUrl; // Use frontend URL from config

    if (!frontendUrl) {
      logger.error(
        "FRONTEND_URL is not set in config. Cannot send password reset link."
      );
      // Don't expose this specific error to the client for security
      return res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    try {
      // 1. Find user by email
      const userResult = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );
      const user = userResult.rows[0];

      if (user) {
        // 2. Generate reset token with configurable length
        const tokenLength = config.passwordReset?.tokenLength || 32; // Default to 32 bytes if not in config
        const resetToken = crypto.randomBytes(tokenLength).toString("hex");
        const hashedToken = crypto
          .createHash("sha256")
          .update(resetToken)
          .digest("hex");

        // 3. Set expiry using config value
        const tokenExpiryMs = config.passwordReset?.tokenExpiry || 60 * 60 * 1000; // Default to 1 hour if not in config
        const expiresAt = new Date(Date.now() + tokenExpiryMs);

        // 4. Store hashed token in DB (assuming 'password_reset_tokens' table exists)
        // Delete any existing tokens for this user first
        await db.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [
          user.id,
        ]);
        const insertTokenQuery = `
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
            `;
        await db.query(insertTokenQuery, [user.id, hashedToken, expiresAt]);

        // 5. Send email (send the *unhashed* token)
        try {
          await sendPasswordResetEmail(email, resetToken, frontendUrl);
          logger.info(
            `Password reset email initiated for user ${user.id} (${email})`
          );
        } catch (emailError) {
          // Log the email error but still return a generic success message
          logger.error(
            `Failed to send password reset email to ${email}:`,
            emailError
          );
        }
      } else {
        // User not found, log it but don't reveal to client
        logger.warn(
          `Password reset requested for non-existent email: ${email}`
        );
      }

      // Always return a generic success message to prevent email enumeration
      res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    } catch (err) {
      logger.error("Forgot password error:", err);
      // Return generic message even on internal errors during this process
      res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }
  }
);

// Reset Password (POST /api/auth/reset-password)
const resetPasswordLimiter = rateLimit({
  windowMs: config.rateLimit.resetPassword.windowMs,
  max: config.rateLimit.resetPassword.max,
  message: config.rateLimit.resetPassword.message,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
});

app.post(
  "/api/auth/reset-password",
  resetPasswordLimiter,
  [
    body("token").notEmpty().withMessage("Reset token is required."),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long.")
      .matches(/\d/)
      .withMessage("Password must contain a number.")
      .matches(/[a-z]/)
      .withMessage("Password must contain a lowercase letter.")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter.")
      .matches(/[^a-zA-Z\d]/)
      .withMessage("Password must contain a special character."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;

    try {
      // 1. Hash the provided token to match the stored hash
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // 2. Find the token in the database and check expiry
      const tokenResult = await db.query(
        "SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = $1",
        [hashedToken]
      );
      const tokenRecord = tokenResult.rows[0];

      if (!tokenRecord) {
        logger.warn(
          `Invalid password reset token attempt: ${token.substring(0, 10)}...`
        );
        return res
          .status(400)
          .json({ error: "Invalid or expired password reset token." });
      }

      if (new Date() > new Date(tokenRecord.expires_at)) {
        logger.warn(
          `Expired password reset token attempt for user ${tokenRecord.user_id}`
        );
        // Clean up expired token
        await db.query(
          "DELETE FROM password_reset_tokens WHERE token_hash = $1",
          [hashedToken]
        );
        return res
          .status(400)
          .json({ error: "Invalid or expired password reset token." });
      }

      // 3. Get the user's current password and password history
      const userId = tokenRecord.user_id;
      const userResult = await db.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId]
      );
      
      if (!userResult.rows.length) {
        return res.status(400).json({ error: "User not found." });
      }
      
      // 3.1 Check if password history enforcement is enabled
      if (config.passwordReset?.enforcePasswordHistory) {
        // Get password history
        const historyResult = await db.query(
          "SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
          [userId, config.passwordReset.passwordHistoryLimit || 5]
        );
        
        // Add current password to the list of passwords to check against
        const passwordsToCheck = [userResult.rows[0].password_hash, 
          ...historyResult.rows.map(row => row.password_hash)];
        
        // Check if new password matches any previous passwords
        for (const oldHash of passwordsToCheck) {
          const matches = await bcrypt.compare(newPassword, oldHash);
          if (matches) {
            return res.status(400).json({ 
              error: "New password cannot be the same as any of your recent passwords." 
            });
          }
        }
      }
      
      // 4. Hash the new password
      const salt = await bcrypt.genSalt(config.bcryptSaltRounds); // Use salt rounds from config
      const newHashedPassword = await bcrypt.hash(newPassword, salt);

      // 5. Store the current password in history before updating
      if (config.passwordReset?.enforcePasswordHistory) {
        try {
          await db.query(
            "INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)",
            [userId, userResult.rows[0].password_hash]
          );
          
          // Prune old password history entries if needed
          await db.query(
            `DELETE FROM password_history 
             WHERE id NOT IN (
               SELECT id FROM password_history 
               WHERE user_id = $1 
               ORDER BY created_at DESC 
               LIMIT $2
             ) 
             AND user_id = $1`,
            [userId, config.passwordReset.passwordHistoryLimit || 5]
          );
        } catch (historyErr) {
          logger.error("Error storing password history:", historyErr);
          // Continue with password reset even if history storage fails
        }
      }

      // 6. Update the user's password in the users table
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        newHashedPassword,
        userId,
      ]);

      // 5. Delete the used reset token
      await db.query(
        "DELETE FROM password_reset_tokens WHERE token_hash = $1",
        [hashedToken]
      );

      // 6. Log the activity (optional)
      try {
        const logQuery = `
                INSERT INTO user_activity_logs (user_id, action, details, ip_address)
                VALUES ($1, $2, $3, $4)
            `;
        await db.query(logQuery, [
          userId,
          "password_reset",
          "User reset password successfully",
          req.ip,
        ]);
      } catch (logErr) {
        logger.error(
          `Failed to log password reset activity for user ${userId}:`,
          logErr
        );
      }

      logger.info(`Password successfully reset for user ${userId}`);
      res.status(200).json({
        message: "Password has been reset successfully. You can now log in.",
      });
    } catch (err) {
      logger.error("Reset password error:", err);
      res
        .status(500)
        .json({ error: "Internal server error during password reset." });
    }
  }
);

// Get Login History (GET /api/auth/login-history)
app.get("/api/auth/login-history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get the limit parameter from query string, default to 10, max 50
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Get login history for the user
    const loginHistory = await accountLockoutService.getLoginHistory(
      userId,
      limit
    );

    // Format the response
    const formattedHistory = loginHistory.map((entry) => ({
      id: entry.id,
      timestamp: entry.attempt_time,
      successful: entry.success,
      ipAddress: entry.ip_address,
      device: entry.user_agent,
      failureReason: entry.failure_reason || null,
    }));

    res.status(200).json({
      loginHistory: formattedHistory,
    });
  } catch (err) {
    logger.error("Error fetching login history:", err);
    res
      .status(500)
      .json({ error: "Internal server error while fetching login history" });
  }
});

// Unlock Account (POST /api/auth/unlock-account) - Admin only
app.post("/api/auth/unlock-account", authenticateToken, async (req, res) => {
  try {
    // Check if the requesting user has admin role
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Unlock the account
    const success = await accountLockoutService.unlockAccount(userId);

    if (success) {
      // Log the action
      await db.query(
        `INSERT INTO user_activity_logs (user_id, action, details, ip_address)
                 VALUES ($1, $2, $3, $4)`,
        [
          req.user.userId,
          "unlock_account",
          `Admin unlocked account for user ${userId}`,
          req.ip,
        ]
      );

      res.status(200).json({ message: "Account unlocked successfully" });
    } else {
      res.status(500).json({ error: "Failed to unlock account" });
    }
  } catch (err) {
    logger.error("Error unlocking account:", err);
    res
      .status(500)
      .json({ error: "Internal server error while unlocking account" });
  }
});

// Two-Factor Authentication Routes

// Verify 2FA Token (POST /api/auth/2fa/verify)
app.post(
  "/api/auth/2fa/verify",
  [
    body("tempToken").notEmpty(),
    body("token").isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const { tempToken, token } = req.body;
      const hashedTempToken = crypto
        .createHash("sha256")
        .update(tempToken)
        .digest("hex");

      // Find and validate temporary token
      const tokenResult = await client.query(
        `SELECT user_id, expires_at FROM two_factor_tokens WHERE token_hash = $1`,
        [hashedTempToken]
      );

      if (!tokenResult.rows[0]) {
        return res.status(400).json({ error: "Invalid or expired session" });
      }

      const { user_id: userId, expires_at: expiresAt } = tokenResult.rows[0];

      if (new Date() > new Date(expiresAt)) {
        await client.query(
          "DELETE FROM two_factor_tokens WHERE token_hash = $1",
          [hashedTempToken]
        );
        await client.query("COMMIT");
        return res.status(400).json({ error: "Session expired" });
      }

      // Verify 2FA token
      const isValid = await twoFactorService.verifyToken(
        userId,
        token,
        req.ip,
        req.headers["user-agent"] || "Unknown"
      );

      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Get user info
      const userResult = await client.query(
        "SELECT email, role, first_name FROM users WHERE id = $1",
        [userId]
      );
      const user = userResult.rows[0];

      // Generate JWT token
      const jwtToken = jwt.sign(
        { userId, email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Clean up temporary token
      await client.query(
        "DELETE FROM two_factor_tokens WHERE token_hash = $1",
        [hashedTempToken]
      );

      // Record successful login
      await accountLockoutService.recordSuccessfulLogin(
        userId,
        user.email,
        req.ip,
        req.headers["user-agent"] || "Unknown"
      );

      await client.query("COMMIT");

      res.status(200).json({
        message: "Two-factor authentication verified successfully",
        token: jwtToken,
        user: {
          id: userId,
          email: user.email,
          firstName: user.first_name,
          role: user.role,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("Error verifying 2FA:", err);
      res
        .status(500)
        .json({ error: "Failed to verify two-factor authentication" });
    } finally {
      client.release();
    }
  }
);

// Get Backup Codes Count (GET /api/auth/2fa/backup-codes/count)
app.get(
  "/api/auth/2fa/backup-codes/count",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const count = await twoFactorService.getRemainingBackupCodes(userId);

      res.status(200).json({ count });
    } catch (err) {
      logger.error("Error getting backup codes count:", err);
      res.status(500).json({ error: "Failed to get backup codes count" });
    }
  }
);

// Verify Backup Code (POST /api/auth/2fa/backup-code/verify)
app.post(
  "/api/auth/2fa/backup-code/verify",
  [
    body("tempToken").notEmpty(),
    body("backupCode")
      .isLength({ min: 10, max: 10 })
      .matches(/^[A-Z0-9]+$/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const { tempToken, backupCode } = req.body;
      const hashedTempToken = crypto
        .createHash("sha256")
        .update(tempToken)
        .digest("hex");

      // Find and validate temporary token
      const tokenResult = await client.query(
        `SELECT user_id, expires_at FROM two_factor_tokens WHERE token_hash = $1`,
        [hashedTempToken]
      );

      if (!tokenResult.rows[0]) {
        return res.status(400).json({ error: "Invalid or expired session" });
      }

      const { user_id: userId, expires_at: expiresAt } = tokenResult.rows[0];

      if (new Date() > new Date(expiresAt)) {
        await client.query(
          "DELETE FROM two_factor_tokens WHERE token_hash = $1",
          [hashedTempToken]
        );
        await client.query("COMMIT");
        return res.status(400).json({ error: "Session expired" });
      }

      // Verify backup code
      const isValid = await twoFactorService.verifyBackupCode(
        userId,
        backupCode
      );

      if (!isValid) {
        return res.status(400).json({ error: "Invalid backup code" });
      }

      // Get user info
      const userResult = await client.query(
        "SELECT email, role, first_name FROM users WHERE id = $1",
        [userId]
      );
      const user = userResult.rows[0];

      // Generate JWT token
      const jwtToken = jwt.sign(
        { userId, email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Clean up temporary token
      await client.query(
        "DELETE FROM two_factor_tokens WHERE token_hash = $1",
        [hashedTempToken]
      );

      // Record successful login
      await accountLockoutService.recordSuccessfulLogin(
        userId,
        user.email,
        req.ip,
        req.headers["user-agent"] || "Unknown"
      );

      await client.query("COMMIT");

      res.status(200).json({
        message: "Backup code verified successfully",
        token: jwtToken,
        user: {
          id: userId,
          email: user.email,
          firstName: user.first_name,
          role: user.role,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("Error verifying backup code:", err);
      res.status(500).json({ error: "Failed to verify backup code" });
    } finally {
      client.release();
    }
  }
);

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  logger.error(`[AuthService Error] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Internal Server Error" });
});

// --- 404 Handler ---
app.use((req, res, next) => {
  res.status(404).json({ error: "Not Found" });
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Auth Service running on port ${PORT}`);
});
