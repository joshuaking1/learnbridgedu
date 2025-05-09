#!/bin/bash

# This script is used by Render.com to build the application

# Print commands and their arguments as they are executed
set -x

# Show Node and NPM versions for debugging
node --version
npm --version

# Install root dependencies
npm install

# Install Clerk SDK explicitly in the root
npm install @clerk/clerk-sdk-node --save

# Array of all services
SERVICES=("ai-service" "analytics-service" "auth-service" "content-service" "discussion-service" "learning-path-service" "notification-service" "quiz-service" "shared" "teacher-tools-service" "user-service" "warming-controller")

# Install dependencies for each service with specific focus on critical dependencies
for SERVICE in "${SERVICES[@]}"; do
  if [ -d "services/$SERVICE" ] && [ -f "services/$SERVICE/package.json" ]; then
    echo "=== Installing dependencies for $SERVICE service ==="
    cd services/$SERVICE
    
    # Clean install to ensure proper dependency resolution
    rm -rf node_modules package-lock.json
    
    # Install service dependencies
    npm install
    
    # Explicitly install Clerk SDK for each service
    npm install @clerk/clerk-sdk-node@^4.13.23 --save
    
    # Explicitly install dotenv for each service
    npm install dotenv@^16.3.1 --save
    
    # Verify installation
    npm list @clerk/clerk-sdk-node dotenv
    
    cd ../..
    echo "=== Completed installation for $SERVICE service ==="
  else
    echo "Skipping $SERVICE - directory or package.json not found"
  fi
done

# Additional verification for shared service (critical for auth)
echo "=== Verifying shared service dependencies ==="
cd services/shared
npm list @clerk/clerk-sdk-node dotenv
ls -la node_modules/@clerk
ls -la node_modules/dotenv
cd ../..

# Additional verification for user service (service currently failing)
echo "=== Verifying user service dependencies ==="
cd services/user-service
npm list @clerk/clerk-sdk-node dotenv
ls -la node_modules/@clerk
ls -la node_modules/dotenv
cd ../..

# Final verification of root installation
echo "Verifying Clerk SDK installation in root..."
npm list @clerk/clerk-sdk-node

# Print working directory and node_modules content for debugging
pwd
ls -la node_modules/@clerk

echo "Build completed successfully"
