// services/quiz-service/middleware/authenticateToken.js
const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");

/**
 * Enhanced authentication middleware that supports both:
 * 1. Direct Clerk authentication (when using Clerk SDK)
 * 2. Temporary token authentication (for API routes from frontend)
 *
 * The temporary token format is: "Bearer clerk_userId_userRole"
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header is required" });
    }

  // Check if it's a temporary token from the frontend
  if (authHeader.startsWith("Bearer clerk_")) {
    try {
      // Parse the temporary token
      const tokenParts = authHeader.split("_");
      if (tokenParts.length !== 3) {
        return res.status(401).json({ error: "Invalid token format" });
      }

      const userId = tokenParts[1];
      const userRole = tokenParts[2];

      // Attach user info to the request
      req.user = {
        userId,
        role: userRole,
      };

      // Also add auth object for compatibility with Clerk
      req.auth = {
        userId,
      };

      console.log(
        `[Auth] Authenticated with temporary token. User ID: ${userId}, Role: ${userRole}`
      );
      return next();
    } catch (error) {
      console.error("Error parsing temporary token:", error);
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // If not a temporary token, use Clerk authentication
  const clerkAuth = ClerkExpressRequireAuth({
    onError: (err) => {
      console.error("[Auth] Clerk authentication error:", err);
      return res.status(401).json({ error: "Authentication failed" });
    },
    afterAuth: (auth) => {
      if (!auth.userId) {
        return res.status(401).json({ error: "User not found" });
      }

      // If Clerk authentication succeeds, add user info to req.user
      req.user = {
        userId: auth.userId,
        role: auth.sessionClaims?.metadata?.role || auth.sessionClaims?.publicMetadata?.role || "student",
      };

      // Also add auth object for compatibility
      req.auth = auth;

      console.log(
        `[Auth] Authenticated with Clerk. User ID: ${auth.userId}, Role: ${req.user.role}`
      );
      
      return next();
    },
  });

  return clerkAuth(req, res);
  } catch (error) {
    console.error("[Auth] Unexpected error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = authenticateToken;
