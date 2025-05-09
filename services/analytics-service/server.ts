// services/analytics-service/server.ts
import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '../shared/logger';
import { authenticateToken } from '../shared/middleware/authenticateToken';

dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Express app setup
const app = express();
const PORT = process.env.ANALYTICS_PORT || 4003;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Analytics Event Type
interface AnalyticsEvent {
  eventType: 'signup_start' | 'signup_validation' | 'signup_creation' | 'signup_verification';
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// Track Event Endpoint
app.post('/api/analytics/track', authenticateToken, async (req, res) => {
  const { eventType, userId, email, metadata } = req.body;

  try {
    // Validate required fields
    if (!eventType || !(userId || email)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert event into database
    await pool.query(
      `INSERT INTO analytics_events (event_type, user_id, email, metadata)
       VALUES ($1, $2, $3, $4)`,
      [eventType, userId, email, metadata]
    );

    res.status(201).json({ message: 'Event tracked successfully' });
  } catch (error) {
    logger.error('Error tracking analytics event:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// Get Analytics Endpoint (Admin only)
app.get('/api/analytics', authenticateToken, async (req, res) => {
  try {
    // Query analytics data
    const result = await pool.query(
      `SELECT * FROM analytics_events
       ORDER BY timestamp DESC
       LIMIT 1000`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Analytics service running on port ${PORT}`);
});

// TypeScript types for API responses
interface TrackEventResponse {
  message: string;
}

interface GetAnalyticsResponse {
  eventType: string;
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export { app, AnalyticsEvent, TrackEventResponse, GetAnalyticsResponse };