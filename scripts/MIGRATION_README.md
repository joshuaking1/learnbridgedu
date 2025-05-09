# User Migration to Clerk

This directory contains scripts to migrate existing users from your custom authentication system to Clerk.

## Prerequisites

1. **Clerk Account**: You need a Clerk account with API keys.
2. **Database Access**: You need access to your PostgreSQL database.
3. **Node.js**: You need Node.js installed on your machine.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install pg dotenv @clerk/clerk-sdk-node
   ```

2. **Configure Environment Variables**:
   - Copy `.env.example` to `.env`
   - Fill in your Clerk API key and database connection string
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Update Database Schema**:
   - Run the SQL script to add the `clerk_id` column to your users table
   ```bash
   psql -U your_username -d your_database -f update-schema-for-clerk.sql
   ```

## Migration Process

### Step 1: Backup Your Database

Always create a backup before running migrations:

```bash
pg_dump -U your_username -d your_database > backup_before_clerk_migration.sql
```

### Step 2: Run the Migration Script

```bash
node migrate-users-to-clerk.js
```

The script will:
1. Check if the `clerk_id` column exists in the users table and create it if needed
2. Fetch all users from your database
3. For each user:
   - Check if they already have a Clerk ID (skip if they do)
   - Create a user in Clerk with their email, name, and role
   - Update the user record in your database with the Clerk ID
4. Generate a report of the migration results

### Step 3: Verify the Migration

After running the migration, you should:

1. Check the migration log file that was generated
2. Verify in the Clerk dashboard that users were created
3. Check your database to ensure users have Clerk IDs

### Step 4: Handle Failed Migrations

If some users failed to migrate:

1. Review the error messages in the migration log
2. Fix any issues (e.g., invalid email formats)
3. Run the migration script again (it will skip already migrated users)

## Post-Migration

After successfully migrating users:

1. Update your application to use Clerk for authentication
2. Inform users that they need to reset their passwords (Clerk will send password reset emails)
3. Monitor for any authentication issues

## Rollback Plan

If you need to rollback:

1. Restore your database from the backup
2. Delete the users created in Clerk
3. Revert any code changes that integrate with Clerk

## Support

If you encounter any issues during migration, contact:
- Your development team
- Clerk support at support@clerk.dev
