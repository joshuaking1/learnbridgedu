// services/shared/middleware/authenticateToken.ts
import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { logger } from '../logger';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

const authenticateToken = ClerkExpressRequireAuth({
  onError: (err) => {
    logger.warn('Authentication error:', err);
    return { error: 'Authentication failed' };
  },
  afterAuth: (auth, req: AuthRequest) => {
    if (!auth.userId) {
      return { error: 'User not found' };
    }

    // Add user info to request
    req.user = {
      userId: auth.userId,
      email: auth.sessionClaims?.email as string,
      role: auth.sessionClaims?.metadata?.role as string || 'student'
    };

    return null;
  }
});

export default authenticateToken;