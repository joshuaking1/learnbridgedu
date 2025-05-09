#!/bin/bash

# This script is used by Render.com to build the application

# Print commands and their arguments as they are executed
set -x

# Install root dependencies
npm install

# Install dependencies for all services
node scripts/install-service-dependencies.js

# Install dependencies for shared service explicitly (critical for auth)
cd services/shared
npm install
cd ../..

# Install dependencies for user-service explicitly
cd services/user-service
npm install
cd ../..

# Install Clerk SDK explicitly in the root and all services directories
npm install @clerk/clerk-sdk-node

# Array of all services
SERVICES=("ai-service" "analytics-service" "auth-service" "content-service" "discussion-service" "learning-path-service" "notification-service" "quiz-service" "shared" "teacher-tools-service" "user-service" "warming-controller")

# Install Clerk SDK in each service
for SERVICE in "${SERVICES[@]}"; do
  echo "Installing Clerk SDK in $SERVICE..."
  cd services/$SERVICE
  npm install @clerk/clerk-sdk-node --save
  cd ../..
done

# List installed packages to verify Clerk SDK is installed
echo "Verifying Clerk SDK installation in root..."
npm list @clerk/clerk-sdk-node

# Verify in each service
for SERVICE in "${SERVICES[@]}"; do
  echo "Verifying Clerk SDK in $SERVICE..."
  cd services/$SERVICE
  npm list @clerk/clerk-sdk-node || echo "Not installed in $SERVICE"
  cd ../..
done

# Print working directory and node_modules content for debugging
pwd
ls -la node_modules/@clerk

echo "Build completed successfully"
