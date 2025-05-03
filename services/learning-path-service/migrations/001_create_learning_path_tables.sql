-- Create learning_paths table
CREATE TABLE IF NOT EXISTS learning_paths (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(100) NOT NULL,
    grade_level VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    estimated_hours INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create skills table
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    learning_path_id INTEGER REFERENCES learning_paths(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    skill_type VARCHAR(50) NOT NULL,
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
    points INTEGER DEFAULT 10,
    prerequisites INTEGER[] DEFAULT '{}',
    order_index INTEGER NOT NULL,
    estimated_minutes INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create skill_resources table
CREATE TABLE IF NOT EXISTS skill_resources (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_url VARCHAR(255),
    book_id VARCHAR(255),
    chapter_index INTEGER,
    quiz_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_skills table to track progress
CREATE TABLE IF NOT EXISTS user_skills (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    status VARCHAR(20) CHECK (status IN ('not_started', 'in_progress', 'completed', 'mastered')),
    progress_percentage INTEGER CHECK (progress_percentage BETWEEN 0 AND 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, skill_id)
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    achievement_type VARCHAR(50) NOT NULL,
    icon_name VARCHAR(100),
    points INTEGER DEFAULT 50,
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')),
    requirements JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

-- Create user_learning_paths table
CREATE TABLE IF NOT EXISTS user_learning_paths (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    learning_path_id INTEGER REFERENCES learning_paths(id) ON DELETE CASCADE,
    status VARCHAR(20) CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_percentage INTEGER CHECK (progress_percentage BETWEEN 0 AND 100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, learning_path_id)
);

-- Create user_recommendations table
CREATE TABLE IF NOT EXISTS user_recommendations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    recommendation_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 1,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create usage_limits table if it doesn't exist
CREATE TABLE IF NOT EXISTS usage_limits (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    service_name VARCHAR(50) NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    usage_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, service_name, usage_date)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_skills_learning_path_id ON skills(learning_path_id);
CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id ON skill_resources(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_paths_user_id ON user_learning_paths(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_paths_learning_path_id ON user_learning_paths(learning_path_id);
CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_id ON user_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_limits_user_date ON usage_limits(user_id, usage_date);

-- Add comments for documentation
COMMENT ON TABLE learning_paths IS 'Defines structured learning paths for students';
COMMENT ON TABLE skills IS 'Individual skills that make up learning paths';
COMMENT ON TABLE skill_resources IS 'Learning resources associated with skills';
COMMENT ON TABLE user_skills IS 'Tracks user progress on individual skills';
COMMENT ON TABLE achievements IS 'Defines achievements that users can unlock';
COMMENT ON TABLE user_achievements IS 'Tracks achievements unlocked by users';
COMMENT ON TABLE user_learning_paths IS 'Tracks user progress on learning paths';
COMMENT ON TABLE user_recommendations IS 'Personalized learning recommendations for users';
COMMENT ON TABLE usage_limits IS 'Tracks daily usage limits for various services by user';
