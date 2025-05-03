-- Create student progress table
CREATE TABLE IF NOT EXISTS student_progress (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id),
    learning_path_id UUID NOT NULL,
    progress_percentage INTEGER NOT NULL DEFAULT 0,
    completed_modules INTEGER NOT NULL DEFAULT 0,
    total_modules INTEGER NOT NULL DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, learning_path_id)
);

-- Create student activities table
CREATE TABLE IF NOT EXISTS student_activities (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id),
    activity_type VARCHAR(50) NOT NULL,
    activity_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(255),
    criteria JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create student achievements table
CREATE TABLE IF NOT EXISTS student_achievements (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id),
    achievement_id INTEGER NOT NULL REFERENCES achievements(id),
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, achievement_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_activities_student_id ON student_activities(student_id);
CREATE INDEX IF NOT EXISTS idx_student_achievements_student_id ON student_achievements(student_id);

-- Insert some default achievements
INSERT INTO achievements (title, description, icon_url, criteria) VALUES
('First Step', 'Complete your first learning module', '/icons/first-step.png', '{"type": "module_completion", "count": 1}'),
('Quick Learner', 'Complete 5 modules in a day', '/icons/quick-learner.png', '{"type": "daily_module_completion", "count": 5}'),
('Perfect Score', 'Achieve 100% on any quiz', '/icons/perfect-score.png', '{"type": "quiz_score", "score": 100}'),
('Dedicated Student', 'Log in for 7 consecutive days', '/icons/dedicated.png', '{"type": "consecutive_logins", "days": 7}'),
('Path Master', 'Complete an entire learning path', '/icons/path-master.png', '{"type": "path_completion", "count": 1}')
ON CONFLICT DO NOTHING; 