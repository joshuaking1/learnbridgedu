# Sending Auth Upgrade Emails to Users

This document provides instructions for sending emails to your users about the authentication system upgrade.

## Prerequisites

1. **Completed Migration**: Make sure you have successfully migrated your users to Clerk.
2. **Email Service**: You need access to an SMTP email service (Gmail, SendGrid, etc.).
3. **Node.js**: You need Node.js installed on your machine.

## Setup

1. **Install Dependencies**:

   ```bash
   cd scripts
   npm install
   ```

2. **Configure Environment Variables**:

   - Copy `.env.email` to `.env`
   - Fill in your Supabase and email service credentials

   ```bash
   cp .env.email .env
   # Edit .env with your values
   ```

   For Hostinger email, you'll need:

   - Your Hostinger email address (e.g., support@yourdomain.com)
   - Your Hostinger email password
   - The SMTP settings are already configured in the .env.email file:
     - Host: smtp.hostinger.com
     - Port: 465
     - Encryption: SSL (secure: true)

3. **Customize Email Template** (Optional):
   - Edit `email-templates/auth-system-upgrade.html` if you want to customize the email content

## Sending Emails

1. **Test Email** (Optional):

   - Before sending to all users, you might want to test the email by modifying the script to send to just one email address

2. **Send Emails to All Users**:

   ```bash
   npm run send-emails
   ```

3. **Monitor Progress**:
   - The script will output progress information as it sends emails
   - It will create a log file with the results

## What the Script Does

1. Connects to your Supabase database
2. Retrieves all users who have been migrated to Clerk (have a clerk_id)
3. Sends each user an email explaining the authentication system upgrade
4. Provides instructions on how to reset their password
5. Generates a report of the email sending results

## Troubleshooting

If you encounter issues:

1. **Email Service Errors**:

   - Check your email service credentials
   - Make sure your email service allows sending from your application
   - Some services have rate limits on how many emails you can send

2. **Database Connection Issues**:

   - Verify your Supabase URL and service role key
   - Check that your IP address is allowed to access Supabase

3. **Script Errors**:
   - Check the error messages in the console
   - Make sure all dependencies are installed

## After Sending Emails

After sending the emails, you should:

1. **Monitor Support Requests**:

   - Be prepared to assist users who have trouble resetting their passwords
   - Consider setting up a dedicated support channel for authentication issues

2. **Track Login Activity**:

   - Monitor how many users successfully log in with the new system
   - Follow up with users who haven't logged in after a certain period

3. **Complete the Transition**:
   - Once most users have successfully logged in, you can complete the transition to Clerk
   - Phase out your custom auth service when it's no longer needed
