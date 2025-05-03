-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- Create quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    questions JSONB NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes(created_by);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at ON quizzes(created_at);

-- Set up Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Create policies for documents
CREATE POLICY "Users can view their own documents" ON documents
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own documents" ON documents
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own documents" ON documents
    FOR DELETE USING (auth.uid() = created_by);

-- Create policies for quizzes
CREATE POLICY "Users can view their own quizzes" ON quizzes
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own quizzes" ON quizzes
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own quizzes" ON quizzes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own quizzes" ON quizzes
    FOR DELETE USING (auth.uid() = created_by); 