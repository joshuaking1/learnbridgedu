import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // Get token from the Authorization header (e.g., "Bearer TOKEN")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token is missing.' });
  }

  // Verify the token
  try {
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET is not defined in environment variables');
      return res.status(500).json({ error: 'Internal server error: Authentication configuration missing' });
    }

    const user = jwt.verify(token, jwtSecret);
    req.user = user;
    next();
  } catch (err: any) {
    console.warn('JWT Verification Error:', {
      error: err.message,
      errorType: err.name
    });
    
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Forbidden: Access token has expired.' });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Forbidden: Invalid access token.' });
    } else {
      return res.status(403).json({ error: 'Forbidden: Token verification failed.' });
    }
  }
};