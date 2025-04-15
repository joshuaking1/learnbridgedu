# AI Service

This service handles document processing, embedding generation, and AI-powered responses for the LearnBridge Education platform.

## Recent Changes

### Fixed Database Schema Compatibility Issue

The code has been updated to work with the current database schema without requiring migrations. This ensures compatibility with free hosting services that don't allow direct database migrations.

#### Changes Made:
- Removed references to the `user_id` column in SQL queries
- Simplified the document processing logic to use only existing database columns
- Removed migration scripts that can't be run on free hosting services

## Running the Service

```bash
# Install dependencies
npm install

# Start the service
npm start

# For development with auto-reload
npm run dev
```

## Environment Variables

Make sure to set the following environment variables:

```
PORT=3004
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_jwt_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GROQ_API_KEY=your_groq_api_key
```
