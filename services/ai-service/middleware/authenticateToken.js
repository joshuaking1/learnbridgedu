// services/ai-service/middleware/authenticateToken.js
require("dotenv").config();
const { Clerk } = require("@clerk/clerk-sdk-node");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

// Direct implementation of Clerk authentication middleware with JWT template support
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

    // Check if token is a JWT format (has two dots for header.payload.signature)
    if (token.split(".").length === 3) {
      logger.info("JWT format token detected, using JWT verification");
      return verifyJwtToken(token, req, res, next);
    }

    // Check if we have Clerk configured
    if (!process.env.CLERK_SECRET_KEY) {
      logger.warn(
        "CLERK_SECRET_KEY not found, falling back to JWT verification"
      );
      return verifyJwtToken(token, req, res, next);
    }

    // Initialize Clerk client for normal user authentication (session tokens)
    const clerk = new Clerk({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Verify the token with Clerk
    // Use Clerk's JWT verification for custom JWT templates
    clerk
      .verifyToken(token, {
        leeway: 60,
        skipJwtSignatureVerification: false, // Ensure signature verification is performed
      })
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

// JWT verification function for Clerk JWT templates and legacy JWT tokens
function verifyJwtToken(token, req, res, next) {
  try {
    // First try to verify as a Clerk JWT template
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerk = new Clerk({
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        // Attempt to verify as a Clerk JWT template
        clerk
          .verifyToken(token, {
            leeway: 60,
            skipJwtSignatureVerification: false,
          })
          .then((claims) => {
            // Successfully verified as a Clerk JWT template
            logger.info(`Clerk JWT template verification successful for token`);

            // Extract user info from claims
            const userId = claims.sub || claims.userId || "service-account";
            const role = claims.role || "service";

            // Add user info to request object
            req.user = {
              userId,
              role,
              ...claims,
            };

            next();
          })
          .catch((clerkError) => {
            // If Clerk verification fails, try legacy JWT as fallback
            logger.warn(
              `Clerk JWT template verification failed, trying legacy JWT: ${clerkError.message}`
            );
            verifyLegacyJwt(token, req, res, next);
          });
      } catch (clerkInitError) {
        // If Clerk initialization fails, try legacy JWT
        logger.warn(
          `Clerk initialization failed, trying legacy JWT: ${clerkInitError.message}`
        );
        verifyLegacyJwt(token, req, res, next);
      }
    } else {
      // No Clerk key available, try legacy JWT
      verifyLegacyJwt(token, req, res, next);
    }
  } catch (error) {
    logger.error("Error in JWT verification:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

// Legacy JWT verification function using JWT_SECRET
function verifyLegacyJwt(token, req, res, next) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      logger.error("JWT_SECRET is not defined in environment variables");
      return res.status(503).json({
        error: "Service Unavailable: Authentication configuration missing",
      });
    }

    // Try to verify with multiple algorithms to handle the "invalid algorithm" error
    try {
      // First try with default algorithm
      let user;
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch (defaultAlgError) {
        // If default fails, try with explicit HS256 algorithm
        if (
          defaultAlgError.name === "JsonWebTokenError" &&
          defaultAlgError.message.includes("algorithm")
        ) {
          logger.warn(
            "JWT verification failed with default algorithm, trying HS256 explicitly"
          );
          try {
            user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
          } catch (hs256Error) {
            // If HS256 fails, try with HS512 algorithm
            if (
              hs256Error.name === "JsonWebTokenError" &&
              hs256Error.message.includes("algorithm")
            ) {
              logger.warn(
                "JWT verification failed with HS256 algorithm, trying HS512"
              );
              try {
                user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] });
              } catch (hs512Error) {
                // If all algorithms fail, throw the original error
                throw defaultAlgError;
              }
            } else {
              // If it's not an algorithm error, throw the HS256 error
              throw hs256Error;
            }
          }
        } else {
          // If it's not an algorithm error, throw the original error
          throw defaultAlgError;
        }
      }

      // If we get here, one of the verification attempts succeeded
      if (!user) {
        throw new Error("JWT verification succeeded but returned no user data");
      }

      // Continue with the verified user
      req.user = user;
      logger.info(
        `Legacy JWT authentication successful for user ID: ${
          user.userId || "unknown"
        }`
      );
      next();
    } catch (err) {
      // Handle verification errors
      logger.error("Legacy JWT verification error:", {
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
  } catch (error) {
    logger.error("Error in legacy JWT verification:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

module.exports = authenticateToken;
