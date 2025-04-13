-- Add audience_type column to sbc_document_chunks table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sbc_document_chunks' 
        AND column_name = 'audience_type'
    ) THEN
        ALTER TABLE sbc_document_chunks 
        ADD COLUMN audience_type VARCHAR(10) NOT NULL DEFAULT 'all' 
        CHECK (audience_type IN ('all', 'teacher', 'student'));
        
        -- Add comment to explain the column
        COMMENT ON COLUMN sbc_document_chunks.audience_type IS 'Specifies which user roles can see this content: all, teacher, or student';
    END IF;
END
$$;
