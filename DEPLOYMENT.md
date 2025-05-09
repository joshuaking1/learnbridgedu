# Deployment Instructions for LearnBridge

This document provides instructions for deploying the LearnBridge application, including the user service that uses Clerk for authentication.

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- A Clerk account with API keys

## Environment Variables

Ensure the following environment variables are set in your deployment environment:

```
# Clerk Authentication
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

# Database
DATABASE_URL=your_supabase_database_url
```

## Deployment Steps

### 1. Install Dependencies

When deploying, make sure to install all dependencies including those in the services directory:

```bash
# Install root dependencies
npm install

# The postinstall script will automatically install dependencies for all services
# This is handled by the scripts/install-service-dependencies.js script
```

### 2. Build the Application

```bash
npm run build
```

### 3. Start the Services

```bash
# Start the user service
cd services/user-service
npm start
```

## Troubleshooting

### Missing Clerk SDK

If you encounter an error like:

```
Error: Cannot find module '@clerk/clerk-sdk-node'
```

Make sure:

1. The `@clerk/clerk-sdk-node` package is listed in the dependencies (not devDependencies) in the root package.json
2. The postinstall script is correctly set up to install dependencies for all services
3. The deployment environment has successfully run the npm install command
4. Check the logs for any errors during the installation process

You can manually verify if all services have the Clerk SDK installed by running:

```bash
node scripts/install-service-dependencies.js
```

This script will install dependencies for all services and check if the Clerk SDK is installed in each service.

### Environment Variables

Ensure all required environment variables are correctly set in your deployment environment. Missing environment variables can cause authentication failures.

## Render.com Specific Instructions

If deploying to Render.com:

1. Set the build command to: `npm install`
2. Set the start command to: `cd services/user-service && npm start`
3. Add all required environment variables in the Render dashboard
4. Make sure the Node.js version is set to v16 or higher

### Deploying Multiple Services

If you need to deploy multiple services on Render.com:

1. Create a separate web service for each microservice
2. For each service, set the build command to: `npm install && cd services/[service-name] && npm install`
3. Set the start command to: `cd services/[service-name] && npm start`
4. Add all required environment variables for each service
5. Make sure to set up proper CORS configuration for communication between services
