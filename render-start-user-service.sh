#!/bin/bash

# This script is used by Render.com to start the user service

# Print commands and their arguments as they are executed
set -x

# Ensure Clerk SDK is installed in the service directory
cd services/user-service
npm list @clerk/clerk-sdk-node || npm install @clerk/clerk-sdk-node

# Start the service
npm start
