const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const logger = require('../utils/logger');

const authenticateToken = ClerkExpressRequireAuth({
  onError: (err) => {
    logger.warn('Authentication error:', err);
    return { error: 'Authentication failed' };
  },
  afterAuth: (auth, req) => {
    if (!auth.userId) {
      return { error: 'User not found' };
    }

    // Add user info to request
    req.user = {
      userId: auth.userId,
      email: auth.sessionClaims?.email,
      role: auth.sessionClaims?.metadata?.role || 'student'
    };

    return null;
  }
});

module.exports = authenticateToken; 