-- Add user_id column to sbc_document_chunks table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sbc_document_chunks' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE sbc_document_chunks 
        ADD COLUMN user_id VARCHAR(255) NULL;
        
        -- Add comment to explain the column
        COMMENT ON COLUMN sbc_document_chunks.user_id IS 'ID of the user who uploaded/processed this document';
    END IF;
END
$$;
