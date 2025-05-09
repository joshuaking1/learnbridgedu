// services/shared/middleware/clerkAuthMiddleware.js
// Try to load dotenv if available, but continue if not
try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv module not found, environment variables must be set manually');
}

// Try to load Clerk SDK
let Clerk;
try {
  const clerkModule = require("@clerk/clerk-sdk-node");
  Clerk = clerkModule.Clerk;
  console.log('Clerk SDK loaded successfully');
} catch (error) {
  console.error('FATAL ERROR: Clerk SDK not found. Please install @clerk/clerk-sdk-node');
  console.error('Installation instructions: npm install @clerk/clerk-sdk-node --save');
  console.error('This is required for authentication to work properly');
  
  // We're exiting with code 0 instead of error code to prevent Render from restarting in a loop
  // This will allow us to see the error message in the logs
  if (process.env.RENDER) {
    console.error('Detected Render.com environment. Exiting process to prevent restart loop.');
    // Use setTimeout to ensure the error messages are logged before exiting
    setTimeout(() => process.exit(0), 1000);
    // Return a mock implementation that will cause graceful failures rather than crashes
    return class MockClerk {
      constructor() {
        console.warn('Using non-functional Clerk placeholder');
      }
    };
  } else {
    // For local development, we'll throw an error
    throw new Error('Clerk SDK not found. Installation required.');
  }
}

// Initialize Clerk client with proper error handling
let clerk;

function initializeClerk() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY is not defined in environment variables');
    throw new Error('CLERK_SECRET_KEY is required');
  }

  try {
    clerk = new Clerk({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    console.log('Clerk SDK initialized successfully');
    return clerk;
  } catch (error) {
    console.error('Failed to initialize Clerk SDK:', error.message);
    throw error;
  }
}

// Initialize Clerk on module load
try {
  clerk = initializeClerk();
} catch (error) {
  console.error('Error during Clerk initialization:', error.message);
  // We won't create a mock here - better to fail fast if Clerk is required
  // This will ensure deployment errors are caught early
}

/**
 * Middleware to authenticate requests using Clerk tokens
 * @param {Object} options - Options for the middleware
 * @param {string|null} options.requireRole - Role required to access the resource
 * @param {Object} options.logger - Logger instance
 * @returns {Function} Express middleware function
 */
function clerkAuthMiddleware(options = {}) {
  const { requireRole = null, logger } = options;

  return async (req, res, next) => {
    try {
      // Check if Clerk is initialized
      if (!clerk) {
        logger.error("Clerk client is not initialized");
        return res
          .status(503)
          .json({ error: "Service Unavailable: Authentication service not initialized" });
      }

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
function requireTeacher(logger) {
  return clerkAuthMiddleware({ requireRole: "teacher", logger });
}

// Middleware specifically for student role
function requireStudent(logger) {
  return clerkAuthMiddleware({ requireRole: "student", logger });
}

// Middleware specifically for admin role
function requireAdmin(logger) {
  return clerkAuthMiddleware({ requireRole: "admin", logger });
}

module.exports = {
  clerkAuthMiddleware,
  requireTeacher,
  requireStudent,
  requireAdmin,
};
