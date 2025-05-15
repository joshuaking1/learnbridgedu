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

    // Log token details for debugging (without exposing the full token)
    logger.info(
      `Token received: ${token.substring(0, 10)}...${token.substring(
        token.length - 5
      )} (length: ${token.length})`
    );

    // Check if token is a Clerk session token (longer tokens, typically 600+ characters)
    if (token.length > 500) {
      logger.info("Clerk session token detected (based on length)");
      // These are always handled by Clerk, not JWT
    }
    // Check if token is a JWT format (has two dots for header.payload.signature)
    else if (token.split(".").length === 3) {
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
    // First try to get the session from the token (for session tokens)
    logger.info("Attempting to verify as Clerk session token");
    
    clerk.verifyToken(token, {
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
      return clerk.users.getUser(sessionClaims.sub)
        .then((user) => {
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

          logger.info(`User authenticated: ${user.id}, role: ${req.user.role}`);
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
          message: "Your session has expired. Please refresh the page to continue.",
        });
      }
      
      // Log more details about the error
      logger.error("Token verification failed:", {
        url: req.originalUrl,
        errorReason: error.reason || "unknown",
        errorMessage: error.message || "No message",
      });
      
      // Try JWT verification as a fallback
      logger.info("Falling back to JWT verification after Clerk verification failed");
      return verifyJwtToken(token, req, res, next);
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
        clerk.verifyToken(token, { 
          leeway: 60,
          skipJwtSignatureVerification: false
        })
        .then(claims => {
          // Successfully verified as a Clerk JWT template
          logger.info(`Clerk JWT template verification successful for token`);
          
          // Extract user info from claims
          const userId = claims.sub || claims.userId || 'service-account';
          const role = claims.role || 'service';
          
          // Add user info to request object
          req.user = {
            userId,
            role,
            ...claims
          };
          
          next();
        })
        .catch(clerkError => {
          // If Clerk verification fails, try legacy JWT as fallback
          logger.warn(`Clerk JWT template verification failed, trying legacy JWT: ${clerkError.message}`);
          verifyLegacyJwt(token, req, res, next);
        });
        
        // This return is important to prevent the function from continuing
        return;
      } catch (clerkInitError) {
        // If Clerk initialization fails, try legacy JWT
        logger.warn(`Clerk initialization failed, trying legacy JWT: ${clerkInitError.message}`);
      }
    }
    
    // If we get here, either Clerk is not configured or initialization failed
    // Fall back to legacy JWT verification
    verifyLegacyJwt(token, req, res, next);
  } catch (error) {
    logger.error("Error in JWT verification:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

// Legacy JWT verification function using JWT_SECRET
function verifyLegacyJwt(token, req, res, next) {
  const ignoreExpiration = process.env.IGNORE_TOKEN_EXPIRATION === "true";
  
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    
    if (!JWT_SECRET) {
      logger.error("JWT_SECRET is not defined in environment variables");
      return res.status(503).json({ 
        error: "Service Unavailable: Authentication configuration missing" 
      });
    }
    
    // Try to verify with multiple algorithms to handle the "invalid algorithm" error
    try {
      // First try with default algorithm
      let user;
      
      // Define all algorithms to try
      const algorithmsToTry = [
        "HS256", "HS512", "HS384", 
        "RS256", "RS384", "RS512", 
        "ES256", "ES384", "ES512", 
        "PS256", "PS384", "PS512"
      ];
      
      // Try default verification first (no algorithm specified)
      try {
        logger.info("Attempting JWT verification with default settings");
        user = jwt.verify(token, JWT_SECRET, {
          ignoreExpiration: ignoreExpiration,
        });
        logger.info("JWT verification successful with default settings");
      } catch (defaultError) {
        logger.warn(`JWT verification with default settings failed: ${defaultError.message}`);
        
        // If default fails, try each algorithm explicitly
        let verificationSuccessful = false;
        
        for (const algorithm of algorithmsToTry) {
          try {
            logger.info(`Attempting JWT verification with ${algorithm} algorithm`);
            user = jwt.verify(token, JWT_SECRET, { 
              algorithms: [algorithm],
              ignoreExpiration: ignoreExpiration // Use the flag for testing
            });
            
            logger.info(`JWT verification with ${algorithm} successful`);
            verificationSuccessful = true;
            break; // Exit the loop if successful
          } catch (algError) {
            // Skip to next algorithm if this one didn't work
            logger.warn(`JWT verification with ${algorithm} failed: ${algError.message}`);
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
      logger.info(`Legacy JWT authentication successful for user ID: ${user.userId || "unknown"}`);
      next();
    } catch (err) {
      // Handle verification errors
      logger.error("Legacy JWT verification error:", {
        error: err.message,
        errorType: err.name,
      });
      
      if (err.name === "TokenExpiredError" && !ignoreExpiration) {
        return res.status(401).json({
          error: "Unauthorized: Token expired",
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please refresh the page to continue.",
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
