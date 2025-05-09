// services/shared/analytics.ts
import { Pool } from 'pg';
import { logger } from './logger';

interface AnalyticsEvent {
  eventType: string;
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function trackAnalyticsEvent(event: AnalyticsEvent) {
  try {
    await pool.query(
      `INSERT INTO analytics_events 
       (event_type, user_id, email, metadata) 
       VALUES ($1, $2, $3, $4)`,
      [
        event.eventType,
        event.userId,
        event.email,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  } catch (error) {
    logger.error('Error tracking analytics event:', error);
    throw error;
  }
}

export { trackAnalyticsEvent, AnalyticsEvent };