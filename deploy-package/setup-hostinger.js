#!/usr/bin/env node

/**
 * LearnBridge Education Platform - Hostinger Setup Script
 * 
 * This script helps with setting up your Next.js application on Hostinger.
 * It creates necessary configuration files and provides guidance.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== LearnBridge Education Platform - Hostinger Setup ===');
console.log('This script will help you set up your application on Hostinger.\n');

// Check if we're in the right directory
const currentDir = process.cwd();
const packageJsonPath = path.join(currentDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('Error: package.json not found in the current directory.');
  console.error('Please run this script from the root of your project.');
  process.exit(1);
}

// Create necessary files
console.log('Creating necessary files...');

// 1. Create server.js if it doesn't exist
const serverJsPath = path.join(currentDir, 'server.js');
if (!fs.existsSync(serverJsPath)) {
  const serverJsContent = `const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(process.env.PORT || 3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:' + (process.env.PORT || 3000));
  });
});`;

  fs.writeFileSync(serverJsPath, serverJsContent);
  console.log('✓ Created server.js');
}

// 2. Create .htaccess if it doesn't exist
const htaccessPath = path.join(currentDir, '.htaccess');
if (!fs.existsSync(htaccessPath)) {
  const htaccessContent = `RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]`;

  fs.writeFileSync(htaccessPath, htaccessContent);
  console.log('✓ Created .htaccess');
}

// 3. Create .env.example if it doesn't exist
const envExamplePath = path.join(currentDir, '.env.example');
if (!fs.existsSync(envExamplePath)) {
  const envExampleContent = `# LearnBridge Education Platform Environment Variables

# Application
NODE_ENV=production
PORT=3000

# API Configuration
NEXT_PUBLIC_API_URL=https://your-api-url.com

# Authentication
NEXT_PUBLIC_AUTH_ENABLED=true
NEXT_PUBLIC_AUTH_PROVIDER=local

# Other Configuration
NEXT_PUBLIC_APP_NAME=LearnBridge Education
NEXT_PUBLIC_APP_DESCRIPTION=An educational platform for teachers and students`;

  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✓ Created .env.example');
}

// 4. Create a simple deployment guide
const guidePath = path.join(currentDir, 'HOSTINGER_DEPLOYMENT_GUIDE.md');
if (!fs.existsSync(guidePath)) {
  const guideContent = `# Deploying LearnBridge to Hostinger - Step by Step Guide

This guide will walk you through deploying your LearnBridge Education Platform to a Hostinger subdomain.

## Prerequisites

1. A Hostinger account with a subdomain
2. SSH access to your Hostinger account
3. Node.js installed on your Hostinger server (if not, contact Hostinger support)

## Step 1: Upload Files to Hostinger

1. Log in to your Hostinger control panel
2. Navigate to the File Manager
3. Go to your subdomain's root directory (usually \`/public_html/\`)
4. Upload all files from this directory to your subdomain

## Step 2: Set Up Node.js on Hostinger

1. Log in to your Hostinger account via SSH:
   \`\`\`
   ssh username@your-subdomain.com
   \`\`\`

2. Navigate to your subdomain directory:
   \`\`\`
   cd public_html
   \`\`\`

3. Install dependencies:
   \`\`\`
   npm install
   \`\`\`

4. Install PM2 (process manager) globally:
   \`\`\`
   npm install -g pm2
   \`\`\`

5. Start your application with PM2:
   \`\`\`
   pm2 start server.js --name "learnbridge"
   \`\`\`

6. Make PM2 start on server reboot:
   \`\`\`
   pm2 startup
   pm2 save
   \`\`\`

## Step 3: Set Up Environment Variables

1. Create a \`.env\` file in your subdomain root:
   \`\`\`
   touch .env
   \`\`\`

2. Add your environment variables based on \`.env.example\`

3. Restart your application:
   \`\`\`
   pm2 restart learnbridge
   \`\`\`

## Troubleshooting

- **Application not starting**: Check the logs with \`pm2 logs learnbridge\`
- **502 Bad Gateway**: Make sure your Node.js application is running and the port is correct
- **404 Not Found**: Check your \`.htaccess\` file and Apache configuration`;

  fs.writeFileSync(guidePath, guideContent);
  console.log('✓ Created HOSTINGER_DEPLOYMENT_GUIDE.md');
}

console.log('\n=== Setup Complete ===');
console.log('Your project is now ready for deployment to Hostinger.');
console.log('\nNext steps:');
console.log('1. Upload all files to your Hostinger subdomain');
console.log('2. Follow the instructions in HOSTINGER_DEPLOYMENT_GUIDE.md');
console.log('3. If you encounter any issues, check the troubleshooting section in the guide'); 