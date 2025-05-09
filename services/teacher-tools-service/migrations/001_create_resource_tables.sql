CREATE TABLE teaching_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    grade_level VARCHAR(50)[] NOT NULL,
    author_id UUID NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    content_format VARCHAR(50) NOT NULL,
    content_data JSONB NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    keywords TEXT[],
    standards_alignment TEXT[],
    views INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    ratings_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0.0,
    visibility VARCHAR(20) DEFAULT 'private',
    collaborators UUID[],
    permissions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resource_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    resource_id UUID NOT NULL REFERENCES teaching_resources(id),
    interaction_type VARCHAR(50) NOT NULL,
    context TEXT,
    duration INTEGER,
    rating INTEGER,
    helpful BOOLEAN,
    feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, resource_id, interaction_type)
);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY,
    preferred_subjects TEXT[],
    preferred_grade_levels TEXT[],
    preferred_resource_types TEXT[],
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recommendation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    resource_id UUID NOT NULL REFERENCES teaching_resources(id),
    match_score DECIMAL(5,4),
    clicked BOOLEAN DEFAULT false,
    recommended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resources_subject_grade ON teaching_resources(subject, grade_level);
CREATE INDEX idx_resource_interactions_user ON resource_interactions(user_id);
CREATE INDEX idx_resource_interactions_resource ON resource_interactions(resource_id);
CREATE INDEX idx_recommendations_user ON recommendation_history(user_id);