# Database Migration Instructions

This document explains how to fix the "column 'user_id' of relation 'sbc_document_chunks' does not exist" error.

## The Issue

The AI service is trying to store document chunks with a `user_id` column, but this column doesn't exist in the database yet. The migration file exists but hasn't been applied.

## Solution 1: Run the Migration Script

1. Connect to your server where the AI service is running
2. Navigate to the AI service directory
3. Run the migration script:

```bash
node apply-migration.js
```

This will add the `user_id` column to the `sbc_document_chunks` table.

## Solution 2: Automatic Migration on Startup

The `start` script in package.json has been updated to run migrations automatically before starting the server:

```json
"start": "node run-migrations.js && node server.js"
```

Simply restart the AI service, and it will run the migrations before starting.

## Solution 3: Fallback Implementation

The code has been updated to handle the case where the `user_id` column doesn't exist yet:

1. It will first try to insert with the `user_id` column
2. If that fails with a "column 'user_id' does not exist" error, it will fall back to inserting without the `user_id` column
3. This allows the service to continue working even if the migration hasn't been applied yet

## Verifying the Fix

After applying one of the solutions above, upload a document again and check the logs. You should no longer see the "column 'user_id' of relation 'sbc_document_chunks' does not exist" error.

## Additional Information

The `user_id` column is used to track which user uploaded each document. This is useful for:

- Auditing who uploaded what document
- Potentially implementing user-specific document access controls in the future
