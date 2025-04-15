// services/content-service/middleware/authorizeRole.js

// This function RETURNS a middleware function, allowing us to specify allowed roles
function authorizeRole(allowedRoles) {
    // Ensure allowedRoles is always an array
    if (!Array.isArray(allowedRoles)) {
      allowedRoles = [allowedRoles];
    }

    // The actual middleware function
    return (req, res, next) => {
      // This middleware assumes 'authenticateToken' has already run
      // and populated req.user with the token payload { userId, email, role }
      if (!req.user || !req.user.role) {
        console.warn('[Authz] User or role not found on request object. Ensure authenticateToken runs first.');
        // This shouldn't happen if authenticateToken ran correctly
        return res.status(401).json({ error: 'Unauthorized: User data missing.' });
      }

      const userRole = req.user.role;
      console.log(`[Authz] Checking if user role "${userRole}" is in allowed roles: [${allowedRoles.join(', ')}]`);

      // Check if the user's role is included in the list of allowed roles
      if (allowedRoles.includes(userRole)) {
        // User has the required role, allow access
        console.log(`[Authz] Access granted for role "${userRole}".`);
        next(); // Proceed to the next middleware or route handler
      } else {
        // User does not have the required role
        console.warn(`[Authz] Access denied for role "${userRole}". Allowed: [${allowedRoles.join(', ')}]`);
        res.status(403).json({ error: 'Forbidden: You do not have sufficient permissions to access this resource.' });
      }
    };
  }

  export default authorizeRole;