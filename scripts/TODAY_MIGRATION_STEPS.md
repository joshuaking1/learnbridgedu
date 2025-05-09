# Today's Migration Steps: Transitioning to Clerk Authentication

This document outlines the specific steps to complete the migration to Clerk authentication by the end of today.

## Prerequisites

1. **Clerk Account**: Make sure you have a Clerk account and have created an application.
2. **Supabase Access**: You need access to your Supabase project with the service role key.
3. **Node.js**: Make sure Node.js is installed on your machine.

## Step 1: Set Up Environment Variables (15 minutes)

1. **Get Clerk API Keys**:
   - Log in to your Clerk Dashboard at https://dashboard.clerk.dev/
   - Select your application
   - Go to "API Keys" in the sidebar
   - Copy the "Secret Key" (starts with `sk_test_` or `sk_live_`)

2. **Get Supabase Credentials**:
   - Log in to your Supabase Dashboard
   - Select your project
   - Go to "Settings" > "API"
   - Copy the "URL" and "service_role key"

3. **Update Environment Variables**:
   - Edit the `scripts/.env` file with your actual credentials:
     ```
     CLERK_SECRET_KEY=your_clerk_secret_key
     SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
     DEFAULT_MIGRATION_PASSWORD=ChangeMe123!
     ```

## Step 2: Update Supabase Schema (15 minutes)

1. **Run the SQL Script**:
   - Log in to your Supabase Dashboard
   - Select your project
   - Go to "SQL Editor"
   - Create a new query
   - Copy and paste the contents of `scripts/update-schema-for-clerk.sql`
   - Run the query

2. **Verify the Schema Changes**:
   - Go to "Table Editor"
   - Select the "users" table
   - Verify that the "clerk_id" column has been added

## Step 3: Install Dependencies (10 minutes)

1. **Install Required Packages**:
   ```bash
   cd scripts
   npm install dotenv @clerk/clerk-sdk-node @supabase/supabase-js
   ```

## Step 4: Test the Integration (15 minutes)

1. **Run the Test Script**:
   ```bash
   node test-clerk-integration.js
   ```

2. **Fix Any Issues**:
   - If any tests fail, review the error messages and fix the issues
   - Common issues include incorrect API keys or Supabase configuration

## Step 5: Configure Clerk Settings (30 minutes)

1. **Set Up Sign-In Methods**:
   - Go to your Clerk Dashboard
   - Navigate to "Authentication" > "Email, Phone, Username"
   - Enable the authentication methods you want to support
   - Configure password settings

2. **Configure Social Providers** (optional):
   - Navigate to "Authentication" > "Social connections"
   - Set up any social providers you want to support (Google, Microsoft, etc.)

3. **Set Up Email Templates**:
   - Navigate to "Customization" > "Email templates"
   - Customize the email templates for password reset, etc.

4. **Create Webhook**:
   - Navigate to "Webhooks"
   - Add a new endpoint with your webhook URL (e.g., `https://app.learnbridgedu.com/api/webhook/clerk`)
   - Select the events you want to receive (`user.created`, `user.updated`, `user.deleted`)
   - Copy the "Signing Secret" (this is your `CLERK_WEBHOOK_SECRET`)

## Step 6: Run the Migration (30 minutes)

1. **Create a Backup** (IMPORTANT):
   - Create a backup of your Supabase database before proceeding
   - In Supabase, go to "Database" > "Backups" and create a manual backup

2. **Run the Migration Script**:
   ```bash
   node migrate-users-to-clerk.js
   ```

3. **Monitor the Migration**:
   - Watch the console output for any errors
   - The script will create a log file with the results

4. **Verify the Migration**:
   - Check your Clerk Dashboard to see the migrated users
   - Check your Supabase database to verify that users have Clerk IDs

## Step 7: Update Frontend Environment Variables (15 minutes)

1. **Update Frontend Environment Variables**:
   - Edit the `frontend/.env.local` file with your Clerk credentials:
     ```
     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_publishable_key
     CLERK_SECRET_KEY=your_secret_key
     CLERK_WEBHOOK_SECRET=your_webhook_secret
     ```

2. **Generate Internal API Key**:
   - Generate a secure random string for your internal API key:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Add it to your `.env.local` file:
     ```
     INTERNAL_API_KEY=your_generated_key
     ```

## Step 8: Deploy the Changes (45 minutes)

1. **Deploy Frontend Changes**:
   - Commit and push your changes to your repository
   - Deploy the frontend to your hosting provider

2. **Update Backend Services**:
   - Update each service to use the Clerk authentication middleware
   - Deploy the updated services

3. **Test the Deployment**:
   - Test signing in with a migrated user
   - Test signing up as a new user
   - Test protected routes and role-based access

## Step 9: Monitor and Troubleshoot (Ongoing)

1. **Monitor Authentication**:
   - Watch for any authentication errors in your logs
   - Monitor user feedback and support requests

2. **Be Ready to Rollback**:
   - If critical issues arise, be prepared to rollback to your custom auth service
   - Use the database backup you created earlier

## Completion Checklist

- [ ] Environment variables set up
- [ ] Supabase schema updated
- [ ] Dependencies installed
- [ ] Integration tests passing
- [ ] Clerk settings configured
- [ ] Users migrated successfully
- [ ] Frontend environment variables updated
- [ ] Changes deployed
- [ ] Authentication working in production

## Troubleshooting Common Issues

1. **Migration Script Errors**:
   - Check your Clerk and Supabase credentials
   - Verify that the users table has the expected structure
   - Look for specific error messages in the console output

2. **Authentication Failures**:
   - Check that the Clerk publishable key is correctly set in the frontend
   - Verify that the Clerk secret key is correctly set in the backend services
   - Check that the webhook secret is correctly configured

3. **Role-Based Access Issues**:
   - Verify that user roles are correctly set in Clerk's public metadata
   - Check that your middleware is correctly checking for roles

4. **Database Connection Issues**:
   - Verify your Supabase URL and service role key
   - Check that your IP address is allowed to access Supabase

## Need Help?

If you encounter issues that you can't resolve, contact:
- Clerk support at support@clerk.dev
- Your development team lead
