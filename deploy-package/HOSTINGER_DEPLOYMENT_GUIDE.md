# Deploying LearnBridge to Hostinger - Step by Step Guide

This guide will walk you through deploying your LearnBridge Education Platform to a Hostinger subdomain.

## Prerequisites

1. A Hostinger account with a subdomain
2. SSH access to your Hostinger account
3. Node.js installed on your Hostinger server (if not, contact Hostinger support)

## Step 1: Prepare Your Files

1. Make sure you have the following files in your deployment package:
   - `server.js` - The Node.js server file
   - `package.json` - Dependencies and scripts
   - `.htaccess` - Apache configuration
   - `.env.example` - Template for environment variables
   - `README.md` - Documentation

2. Create a `.env` file based on `.env.example` with your actual configuration values.

## Step 2: Upload Files to Hostinger

1. Log in to your Hostinger control panel
2. Navigate to the File Manager
3. Go to your subdomain's root directory (usually `/public_html/`)
4. Upload all files from the deployment package to this directory

## Step 3: Set Up Node.js on Hostinger

1. Log in to your Hostinger account via SSH:
   ```
   ssh username@your-subdomain.com
   ```

2. Navigate to your subdomain directory:
   ```
   cd public_html
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Install PM2 (process manager) globally:
   ```
   npm install -g pm2
   ```

5. Start your application with PM2:
   ```
   pm2 start server.js --name "learnbridge"
   ```

6. Make PM2 start on server reboot:
   ```
   pm2 startup
   pm2 save
   ```

## Step 4: Configure Apache (if needed)

If your application is not accessible after setting up Node.js, you may need to configure Apache:

1. Make sure the `.htaccess` file is properly uploaded
2. Enable mod_proxy and mod_proxy_http in Apache:
   ```
   a2enmod proxy
   a2enmod proxy_http
   ```

3. Restart Apache:
   ```
   service apache2 restart
   ```

## Step 5: Set Up Environment Variables

1. Create a `.env` file in your subdomain root:
   ```
   touch .env
   ```

2. Add your environment variables:
   ```
   NODE_ENV=production
   PORT=3000
   # Add other environment variables as needed
   ```

3. Restart your application:
   ```
   pm2 restart learnbridge
   ```

## Step 6: Verify Your Deployment

1. Visit your subdomain in a web browser
2. Check that all features are working correctly
3. Monitor the logs for any errors:
   ```
   pm2 logs learnbridge
   ```

## Troubleshooting

- **Application not starting**: Check the logs with `pm2 logs learnbridge`
- **502 Bad Gateway**: Make sure your Node.js application is running and the port is correct
- **404 Not Found**: Check your `.htaccess` file and Apache configuration
- **Disk space issues**: Clean up unnecessary files or contact Hostinger support to increase your disk space

## Additional Resources

- [Hostinger Node.js Documentation](https://www.hostinger.com/tutorials/how-to-install-node-js-on-hosting)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment) 