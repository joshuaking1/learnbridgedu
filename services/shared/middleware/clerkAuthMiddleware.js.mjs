// services/shared/middleware/clerkAuthMiddleware.js.mjs
import { Clerk } from '@clerk/clerk-sdk-node';

/**
 * Middleware to authenticate requests using Clerk tokens
 * @param {Object} options - Options for the middleware
 * @param {string|null} options.requireRole - Role required to access the resource
 * @param {Object} options.logger - Logger instance
 * @returns {Function} Express middleware function
 */
export function clerkAuthMiddleware(options = {}) {
  const { requireRole = null, logger } = options;

  // Initialize Clerk client
  const clerk = new Clerk({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  return async (req, res, next) => {
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

      try {
        // Verify the token with Clerk
        const sessionClaims = await clerk.verifyToken(token);

        if (!sessionClaims || !sessionClaims.sub) {
          logger.warn("Invalid token: Failed verification");
          return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        // Get the user from Clerk
        const user = await clerk.users.getUser(sessionClaims.sub);

        if (!user) {
          logger.warn(`User not found for ID: ${sessionClaims.sub}`);
          return res
            .status(401)
            .json({ error: "Unauthorized: User not found" });
        }

        // Check if a specific role is required
        if (requireRole) {
          const userRole = user.publicMetadata?.role;

          if (userRole !== requireRole) {
            logger.warn(
              `User ${user.id} has role ${userRole}, but ${requireRole} is required`
            );
            return res
              .status(403)
              .json({ error: `Forbidden: ${requireRole} role required` });
          }
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
      } catch (error) {
        logger.error("Error verifying token:", error);
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
      }
    } catch (error) {
      logger.error("Error in auth middleware:", error);
      return res
        .status(500)
        .json({ error: "Internal server error during authentication" });
    }
  };
}

// Middleware specifically for teacher role
export function requireTeacher(logger) {
  return clerkAuthMiddleware({ requireRole: "teacher", logger });
}

// Middleware specifically for student role
export function requireStudent(logger) {
  return clerkAuthMiddleware({ requireRole: "student", logger });
}

// Middleware specifically for admin role
export function requireAdmin(logger) {
  return clerkAuthMiddleware({ requireRole: "admin", logger });
}
