-- Forum system database migration script

-- Forums table
CREATE TABLE IF NOT EXISTS forums (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0
);

-- Threads table
CREATE TABLE IF NOT EXISTS threads (
  id SERIAL PRIMARY KEY,
  forum_id INTEGER REFERENCES forums(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_solution BOOLEAN DEFAULT FALSE,
  parent_id INTEGER REFERENCES posts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Thread tags table
CREATE TABLE IF NOT EXISTS thread_tags (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  tag_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Post reactions table
CREATE TABLE IF NOT EXISTS post_reactions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  reaction_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id, reaction_type)
);

-- Post attachments table
CREATE TABLE IF NOT EXISTS post_attachments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User thread subscriptions table
CREATE TABLE IF NOT EXISTS user_thread_subscriptions (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(thread_id, user_id)
);

-- Bot responses table
CREATE TABLE IF NOT EXISTS bot_responses (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_threads_forum_id ON threads(forum_id);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_tags_thread_id ON thread_tags(thread_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);

-- Create or replace functions for updating timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatically updating timestamps
DROP TRIGGER IF EXISTS update_forums_modtime ON forums;
CREATE TRIGGER update_forums_modtime
BEFORE UPDATE ON forums
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS update_threads_modtime ON threads;
CREATE TRIGGER update_threads_modtime
BEFORE UPDATE ON threads
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS update_posts_modtime ON posts;
CREATE TRIGGER update_posts_modtime
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();

-- Create sample forum categories for testing
INSERT INTO forums (name, description, category, sort_order)
VALUES 
('General Discussion', 'General topics related to education and learning', 'General', 1),
('Mathematics', 'Discuss math topics, problems, and concepts', 'Academic', 2),
('Science', 'Physics, Chemistry, Biology and other scientific topics', 'Academic', 3),
('Language Arts', 'Reading, writing, and literary discussions', 'Academic', 4),
('Technical Support', 'Get help with the LearnBridge platform', 'Support', 5)
ON CONFLICT DO NOTHING;
