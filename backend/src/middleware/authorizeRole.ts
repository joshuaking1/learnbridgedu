import { Request, Response, NextFunction } from 'express';

// This function RETURNS a middleware function, allowing us to specify allowed roles
export const authorizeRole = (allowedRoles: string | string[]) => {
  // Ensure allowedRoles is always an array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  // The actual middleware function
  return (req: Request, res: Response, next: NextFunction) => {
    // This middleware assumes 'authenticateToken' has already run
    // and populated req.user with the token payload { userId, email, role }
    if (!req.user || !req.user.role) {
      console.warn('[Authz] User or role not found on request object. Ensure authenticateToken runs first.');
      return res.status(401).json({ error: 'Unauthorized: User data missing.' });
    }
  
    const userRole = req.user.role;
    console.log(`[Authz] Checking if user role "${userRole}" is in allowed roles: [${roles.join(', ')}]`);
  
    // Check if the user's role is included in the list of allowed roles
    if (roles.includes(userRole)) {
      // User has the required role, allow access
      console.log(`[Authz] Access granted for role "${userRole}".`);
      next(); // Proceed to the next middleware or route handler
    } else {
      // User does not have the required role
      console.warn(`[Authz] Access denied for role "${userRole}". Allowed: [${roles.join(', ')}]`);
      res.status(403).json({ error: 'Forbidden: You do not have sufficient permissions to access this resource.' });
    }
  };
};