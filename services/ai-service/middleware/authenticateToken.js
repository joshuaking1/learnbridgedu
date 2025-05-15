// services/ai-service/middleware/authenticateToken.js
require("dotenv").config();
const { Clerk } = require("@clerk/clerk-sdk-node");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

// Direct implementation of Clerk authentication middleware with JWT template support
// This avoids dependency resolution issues on Render.com by not using the shared middleware
function authenticateToken(req, res, next) {
  // For testing: Check if we should ignore token expiration
  // This should only be used in development/testing environments
  const ignoreExpiration = process.env.IGNORE_TOKEN_EXPIRATION === "true";
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
        leeway: 300, // Increase leeway to 5 minutes to handle clock skew
        skipJwtSignatureVerification: false, // Ensure signature verification is performed
        ignoreExpiration: ignoreExpiration, // Use the flag for testing
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

      // Define all algorithms to try
      const algorithmsToTry = [
        "HS256",
        "HS512",
        "HS384",
        "RS256",
        "RS384",
        "RS512",
        "ES256",
        "ES384",
        "ES512",
        "PS256",
        "PS384",
        "PS512",
      ];

      // Try default verification first (no algorithm specified)
      try {
        logger.info("Attempting JWT verification with default settings");
        user = jwt.verify(token, JWT_SECRET, {
          ignoreExpiration: ignoreExpiration,
        });
        logger.info("JWT verification successful with default settings");
      } catch (defaultError) {
        logger.warn(
          `JWT verification with default settings failed: ${defaultError.message}`
        );

        // If default fails, try each algorithm explicitly
        let verificationSuccessful = false;

        for (const algorithm of algorithmsToTry) {
          try {
            logger.info(
              `Attempting JWT verification with ${algorithm} algorithm`
            );
            user = jwt.verify(token, JWT_SECRET, {
              algorithms: [algorithm],
              ignoreExpiration: true, // Temporarily ignore expiration to test if algorithm works
            });

            // If we're in testing mode and should ignore expiration, we can stop here
            if (ignoreExpiration) {
              logger.info(
                `Using algorithm ${algorithm} with expiration ignored for testing`
              );
              verificationSuccessful = true;
              break;
            }

            // If we get here, the algorithm worked but might have other issues
            logger.info(
              `JWT verification with ${algorithm} successful (ignoring expiration)`
            );

            // Now try again with expiration check to get the real error if any
            try {
              user = jwt.verify(token, JWT_SECRET, { algorithms: [algorithm] });
              logger.info(
                `JWT verification with ${algorithm} fully successful`
              );
              verificationSuccessful = true;
              break; // Exit the loop if successful
            } catch (expError) {
              if (expError.name === "TokenExpiredError") {
                // Token is expired but algorithm is correct
                logger.warn(
                  `JWT token is expired but ${algorithm} algorithm is correct`
                );
                throw expError; // Re-throw expiration error
              } else {
                // Some other error
                logger.warn(
                  `JWT verification with ${algorithm} failed after algorithm check: ${expError.message}`
                );
              }
            }
          } catch (algError) {
            // Skip to next algorithm if this one didn't work
            if (algError.name === "TokenExpiredError") {
              // Token is expired but algorithm is correct
              logger.warn(
                `JWT token is expired but ${algorithm} algorithm is correct`
              );
              throw algError; // Re-throw expiration error
            }

            logger.warn(
              `JWT verification with ${algorithm} failed: ${algError.message}`
            );
          }
        }

        // If we tried all algorithms and none worked
        if (!verificationSuccessful) {
          logger.error("JWT verification failed with all algorithms");
          throw defaultError; // Throw the original error
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
