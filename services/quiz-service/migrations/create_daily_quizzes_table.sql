-- Create daily_quizzes table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'daily_quizzes'
    ) THEN
        CREATE TABLE daily_quizzes (
            id SERIAL PRIMARY KEY,
            subject VARCHAR(100) NOT NULL,
            book VARCHAR(255) NOT NULL,
            topic VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            quiz_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            UNIQUE(book, quiz_date) -- Ensure only one daily quiz per book per day
        );
        
        -- Add comment to explain the table
        COMMENT ON TABLE daily_quizzes IS 'Daily quizzes automatically generated for each book in the SBC';
    END IF;
END
$$;

-- Create daily_quiz_questions table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'daily_quiz_questions'
    ) THEN
        CREATE TABLE daily_quiz_questions (
            id SERIAL PRIMARY KEY,
            daily_quiz_id INTEGER NOT NULL REFERENCES daily_quizzes(id) ON DELETE CASCADE,
            question_type VARCHAR(50) NOT NULL DEFAULT 'multiple_choice',
            question_text TEXT NOT NULL,
            options JSONB, -- For multiple choice options
            correct_answer TEXT NOT NULL,
            explanation TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Add comment to explain the table
        COMMENT ON TABLE daily_quiz_questions IS 'Questions for daily quizzes automatically generated for SBC books';
        
        -- Create index for faster lookups
        CREATE INDEX idx_daily_quiz_questions_quiz_id ON daily_quiz_questions(daily_quiz_id);
    END IF;
END
$$;

-- Create daily_quiz_attempts table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'daily_quiz_attempts'
    ) THEN
        CREATE TABLE daily_quiz_attempts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            daily_quiz_id INTEGER NOT NULL REFERENCES daily_quizzes(id) ON DELETE CASCADE,
            score INTEGER NOT NULL DEFAULT 0,
            total_questions INTEGER NOT NULL,
            percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
            answers_given JSONB NOT NULL, -- Store student answers
            attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, daily_quiz_id) -- Each user can only attempt a daily quiz once
        );
        
        -- Add comment to explain the table
        COMMENT ON TABLE daily_quiz_attempts IS 'Student attempts for daily quizzes';
        
        -- Create indexes for faster lookups
        CREATE INDEX idx_daily_quiz_attempts_user_id ON daily_quiz_attempts(user_id);
        CREATE INDEX idx_daily_quiz_attempts_quiz_id ON daily_quiz_attempts(daily_quiz_id);
    END IF;
END
$$;
