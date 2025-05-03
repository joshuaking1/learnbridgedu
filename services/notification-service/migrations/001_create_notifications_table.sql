-- services/notification-service/migrations/001_create_notifications_table.sql

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL, -- The user who should receive the notification
    type VARCHAR(50) NOT NULL, -- e.g., 'achievement_unlocked', 'new_daily_quiz', 'assignment_due'
    title VARCHAR(255) NOT NULL, -- Short title for the notification
    message TEXT NOT NULL, -- Detailed notification message
    related_entity_type VARCHAR(50), -- e.g., 'achievement', 'quiz', 'course'
    related_entity_id INTEGER, -- ID of the related entity
    is_read BOOLEAN DEFAULT FALSE, -- Has the user read this notification?
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, -- When the notification was generated
    read_at TIMESTAMPTZ -- When the notification was marked as read
);

-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

COMMENT ON TABLE notifications IS 'Stores notifications generated for users by various services.';
COMMENT ON COLUMN notifications.user_id IS 'The user who should receive the notification';
COMMENT ON COLUMN notifications.type IS 'Category of the notification (e.g., achievement_unlocked)';
COMMENT ON COLUMN notifications.title IS 'Short title for the notification display';
COMMENT ON COLUMN notifications.message IS 'Full content of the notification';
COMMENT ON COLUMN notifications.related_entity_type IS 'Type of the entity this notification relates to (if any)';
COMMENT ON COLUMN notifications.related_entity_id IS 'ID of the related entity (if any)';
COMMENT ON COLUMN notifications.is_read IS 'Flag indicating if the user has marked the notification as read';
COMMENT ON COLUMN notifications.created_at IS 'Timestamp when the notification was created';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when the notification was marked as read';