// services/ai-service/middleware/authenticateToken.js
require("dotenv").config();
const { Clerk } = require("@clerk/clerk-sdk-node");
const logger = require("../utils/logger");

// Direct implementation of Clerk authentication middleware
// This avoids dependency resolution issues on Render.com by not using the shared middleware
function authenticateToken(req, res, next) {
  try {
    // Initialize Clerk client
    if (!process.env.CLERK_SECRET_KEY) {
      logger.error('CLERK_SECRET_KEY is not defined in environment variables');
      return res
        .status(503)
        .json({ error: "Service Unavailable: Authentication configuration missing" });
    }

    const clerk = new Clerk({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

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

    // Verify the token with Clerk
    clerk.verifyToken(token)
      .then(sessionClaims => {
        if (!sessionClaims || !sessionClaims.sub) {
          logger.warn("Invalid token: Failed verification");
          return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        // Get the user from Clerk
        return clerk.users.getUser(sessionClaims.sub)
          .then(user => {
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
      .catch(error => {
        logger.error("Error verifying token:", error);
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      });
  } catch (error) {
    logger.error("Error in auth middleware:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

module.exports = authenticateToken;
