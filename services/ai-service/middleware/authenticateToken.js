// services/ai-service/middleware/authenticateToken.js
require("dotenv").config();
const { Clerk } = require("@clerk/clerk-sdk-node");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

// Direct implementation of Clerk authentication middleware with JWT fallback
// This avoids dependency resolution issues on Render.com by not using the shared middleware
function authenticateToken(req, res, next) {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("Missing or invalid Authorization header");
      return res
        .status(401)
        .json({ error: "Unauthorized: Missing or invalid token" });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    if (!token) {
      logger.warn("Empty token provided");
      return res.status(401).json({ error: "Unauthorized: Empty token" });
    }

    // Check for service tokens or special formats that should use JWT
    if (token.startsWith("service_") || token.includes("quiz-service")) {
      logger.info("Service token detected, using JWT verification");
      return verifyJwtToken(token, req, res, next);
    }

    // Check if we have Clerk configured
    if (!process.env.CLERK_SECRET_KEY) {
      logger.warn(
        "CLERK_SECRET_KEY not found, falling back to JWT verification"
      );
      return verifyJwtToken(token, req, res, next);
    }

    // Initialize Clerk client for normal user authentication
    const clerk = new Clerk({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Verify the token with Clerk
    // Add a 60-second leeway to handle clock skew and minor expiration issues
    clerk
      .verifyToken(token, { leeway: 60 })
      .then((sessionClaims) => {
        if (!sessionClaims || !sessionClaims.sub) {
          logger.warn("Invalid token: Failed verification");
          return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        // Get the user from Clerk
        return clerk.users.getUser(sessionClaims.sub).then((user) => {
          if (!user) {
            logger.warn(`User not found for ID: ${sessionClaims.sub}`);
            return res
              .status(401)
              .json({ error: "Unauthorized: User not found" });
          }

          // Add user info to request object
          req.user = {
            userId: user.id,
            email: user.emailAddresses[0]?.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.publicMetadata?.role || "student",
          };

          // Continue to the next middleware or route handler
          next();
        });
      })
      .catch((error) => {
        logger.error("Error verifying token:", error);

        // Check if the error is specifically a token expiration error
        if (error.reason === "token-expired") {
          // Return a specific error code and message for expired tokens
          // The frontend can use this to trigger a token refresh
          logger.warn(`Token expired for request to ${req.originalUrl}`);
          return res.status(401).json({
            error: "Unauthorized: Token expired",
            code: "TOKEN_EXPIRED",
            message:
              "Your session has expired. Please refresh the page to continue.",
          });
        }

        // Log more details about the error
        logger.error("Token verification failed:", {
          url: req.originalUrl,
          errorReason: error.reason || "unknown",
          errorMessage: error.message || "No message",
        });

        return res.status(401).json({
          error: "Unauthorized: Invalid token",
          code: "INVALID_TOKEN",
          message: "Authentication failed. Please sign in again.",
        });
      });
  } catch (error) {
    logger.error("Error in auth middleware:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

// JWT fallback verification function
function verifyJwtToken(token, req, res, next) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      logger.error("JWT_SECRET is not defined in environment variables");
      return res.status(503).json({
        error: "Service Unavailable: Authentication configuration missing",
      });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        logger.error("JWT verification error:", {
          error: err.message,
          errorType: err.name,
        });

        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            error: "Unauthorized: Token expired",
            code: "TOKEN_EXPIRED",
            message:
              "Your session has expired. Please refresh the page to continue.",
          });
        }

        return res.status(401).json({
          error: "Unauthorized: Invalid token",
          code: "INVALID_TOKEN",
          message: "Authentication failed. Please sign in again.",
        });
      }

      // Add user info to request object
      req.user = user;
      logger.info(
        `JWT authentication successful for user ID: ${user.userId || "unknown"}`
      );
      next();
    });
  } catch (error) {
    logger.error("Error in JWT verification:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

module.exports = authenticateToken;
