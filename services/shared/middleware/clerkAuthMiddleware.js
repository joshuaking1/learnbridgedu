// services/shared/middleware/clerkAuthMiddleware.js
const { Clerk } = require('@clerk/clerk-sdk-node');
const logger = require('../logger');

// Initialize Clerk client
const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * Middleware to authenticate requests using Clerk tokens
 */
function clerkAuthMiddleware(options = {}) {
  const { requireRole = null } = options;

  return async (req, res, next) => {
    try {
      // Get the authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid Authorization header');
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      }

      // Extract the token
      const token = authHeader.split(' ')[1];
      
      if (!token) {
        logger.warn('Empty token provided');
        return res.status(401).json({ error: 'Unauthorized: Empty token' });
      }

      try {
        // Verify the token with Clerk
        const sessionClaims = await clerk.verifyToken(token);
        
        if (!sessionClaims || !sessionClaims.sub) {
          logger.warn('Invalid token: Failed verification');
          return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        // Get the user from Clerk
        const user = await clerk.users.getUser(sessionClaims.sub);
        
        if (!user) {
          logger.warn(`User not found for ID: ${sessionClaims.sub}`);
          return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        // Check if a specific role is required
        if (requireRole) {
          const userRole = user.publicMetadata?.role;
          
          if (userRole !== requireRole) {
            logger.warn(`User ${user.id} has role ${userRole}, but ${requireRole} is required`);
            return res.status(403).json({ error: `Forbidden: ${requireRole} role required` });
          }
        }

        // Add user info to request object
        req.user = {
          userId: user.id,
          email: user.emailAddresses[0]?.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.publicMetadata?.role || 'student',
        };

        // Continue to the next middleware or route handler
        next();
      } catch (error) {
        logger.error('Error verifying token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } catch (error) {
      logger.error('Error in auth middleware:', error);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  };
}

// Middleware specifically for teacher role
function requireTeacher() {
  return clerkAuthMiddleware({ requireRole: 'teacher' });
}

// Middleware specifically for student role
function requireStudent() {
  return clerkAuthMiddleware({ requireRole: 'student' });
}

// Middleware specifically for admin role
function requireAdmin() {
  return clerkAuthMiddleware({ requireRole: 'admin' });
}

module.exports = {
  clerkAuthMiddleware,
  requireTeacher,
  requireStudent,
  requireAdmin,
};
