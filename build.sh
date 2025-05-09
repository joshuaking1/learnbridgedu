#!/bin/bash

# Install root dependencies
npm install

# Install dependencies for all services
node scripts/install-service-dependencies.js

# Additional build steps if needed
# npm run build

echo "Build completed successfully"
