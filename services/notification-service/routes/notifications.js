// routes/notifications.js
const express = require('express');
const router = express.Router();
// const db = require('../db'); // DB is now passed via req.db
const authenticateToken = require('../middleware/authenticateToken'); // Assuming you have this middleware

// Placeholder for a simple internal authentication mechanism
// In a real app, use JWT, shared secrets, or mTLS
const internalAuth = (req, res, next) => {
  const internalApiKey = req.headers['x-internal-api-key'];
  if (internalApiKey && internalApiKey === process.env.INTERNAL_SERVICE_API_KEY) {
    next();
  } else {
    console.warn('Unauthorized internal API call attempt');
    res.status(403).send('Forbidden: Invalid internal API key');
  }
};

// Get notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => { // Re-enable auth
  const db = req.db; // Get db connection from request
  try {
    const userId = req.user?.userId; // Get user ID from token
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[NotificationService] Fetching notifications for user ${userId}`);
    // Fetch unread notifications first, then read ones, limit results
    const query = `
      SELECT id, type, title, message, related_entity_type, related_entity_id, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY is_read ASC, created_at DESC
      LIMIT 50; -- Limit the number of notifications returned
    `;
    const { rows } = await db.query(query, [userId]);
    console.log(`[NotificationService] Found ${rows.length} notifications for user ${userId}`);
    res.json(rows);

  } catch (err) {
    console.error('[NotificationService] Error fetching notifications:', err.message);
    res.status(500).send('Server Error');
  }
});

// Mark specific notifications as read
router.post('/mark-read', authenticateToken, async (req, res) => { // Re-enable auth
  const db = req.db;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const { notificationIds } = req.body; // Expecting an array of notification IDs

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid input: notificationIds must be a non-empty array.' });
    }

    console.log(`[NotificationService] Marking notifications ${notificationIds.join(', ')} as read for user ${userId}`);
    const query = `
      UPDATE notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND id = ANY($2::int[]) AND is_read = FALSE
      RETURNING id; -- Return IDs of updated notifications
    `;
    const { rows } = await db.query(query, [userId, notificationIds]);
    console.log(`[NotificationService] Marked ${rows.length} notifications as read for user ${userId}`);
    res.json({ message: `Marked ${rows.length} notifications as read`, updatedIds: rows.map(r => r.id) });

  } catch (err) {
    console.error('[NotificationService] Error marking notifications as read:', err.message);
    res.status(500).send('Server Error');
  }
});

// Mark ALL notifications as read for the user
router.post('/mark-all-read', authenticateToken, async (req, res) => {
  const db = req.db;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`[NotificationService] Marking ALL notifications as read for user ${userId}`);
    const query = `
      UPDATE notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = FALSE
      RETURNING id;
    `;
    const { rows } = await db.query(query, [userId]);
    console.log(`[NotificationService] Marked ${rows.length} total notifications as read for user ${userId}`);
    res.json({ message: `Marked ${rows.length} notifications as read` });

  } catch (err) {
    console.error('[NotificationService] Error marking all notifications as read:', err.message);
    res.status(500).send('Server Error');
  }
});

// --- Internal Endpoint for Sending Notifications ---
// This endpoint is intended to be called by other backend services
router.post('/internal/send', internalAuth, (req, res) => {
  const { userId, notificationData } = req.body;
  const sendNotification = req.app.locals.sendNotification; // Access function from app.locals

  if (!userId || !notificationData) {
    return res.status(400).json({ error: 'Missing userId or notificationData' });
  }

  if (typeof sendNotification !== 'function') {
    console.error('sendNotification function not found in app.locals');
    return res.status(500).json({ error: 'Internal server configuration error' });
  }

  try {
    // sendNotification is now async
    sendNotification(userId, notificationData)
      .then(() => {
        res.status(200).json({ message: 'Notification processed successfully' });
      })
      .catch(error => {
        console.error('[NotificationService] Error processing internal notification send:', error);
        // Don't expose internal errors directly, but log them
        res.status(500).json({ error: 'Failed to process notification' });
      });
  } catch (error) {
    // Catch synchronous errors if any (though unlikely with async call)
    console.error('[NotificationService] Synchronous error triggering notification:', error);
    res.status(500).json({ error: 'Failed to initiate notification processing' });
  }
});

module.exports = router;