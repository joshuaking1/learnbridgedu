// services/quiz-service/middleware/authenticateToken.js
const { Clerk } = require("@clerk/clerk-sdk-node");
const logger = require("../../shared/logger");

// Initialize Clerk client
const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * Middleware to authenticate requests using Clerk tokens
 */
function authenticateToken(req, res, next) {
  try {
    // Get the auth header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN format

    if (!token) {
      logger.warn("[QuizService] Missing authorization token");
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    // Verify the token with Clerk
    clerk
      .verifyToken(token)
      .then((sessionClaims) => {
        if (!sessionClaims || !sessionClaims.sub) {
          logger.warn("[QuizService] Invalid token: Failed verification");
          return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        // Get the user from Clerk
        return clerk.users.getUser(sessionClaims.sub).then((user) => {
          if (!user) {
            logger.warn(
              `[QuizService] User not found for ID: ${sessionClaims.sub}`
            );
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
        logger.error("[QuizService] Error verifying token:", error);
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      });
  } catch (error) {
    logger.error("[QuizService] Error in auth middleware:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

module.exports = authenticateToken;
