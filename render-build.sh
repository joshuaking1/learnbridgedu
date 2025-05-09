#!/bin/bash

# This script is used by Render.com to build the application

# Print commands and their arguments as they are executed
set -x

# Install root dependencies
npm install

# Install dependencies for shared service (critical for auth)
cd services/shared
npm install
cd ../..

# Install dependencies for user-service
cd services/user-service
npm install
cd ../..

# Install Clerk SDK explicitly in case it's missing
npm install @clerk/clerk-sdk-node

# List installed packages to verify Clerk SDK is installed
npm list @clerk/clerk-sdk-node

# Print working directory and node_modules content for debugging
pwd
ls -la node_modules/@clerk

echo "Build completed successfully"
