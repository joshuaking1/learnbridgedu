#!/bin/bash

# Deployment script for Hostinger

# 1. Build the Next.js application
echo "Building Next.js application..."
cd ../frontend
npm run build

# 2. Create deployment package
echo "Creating deployment package..."
cd ..
mkdir -p deploy-package/frontend
cp -r frontend/.next deploy-package/frontend/
cp -r frontend/public deploy-package/frontend/
cp frontend/package.json deploy-package/frontend/
cp frontend/next.config.js deploy-package/frontend/

# 3. Create a simple server.js file for Hostinger
echo "Creating server.js file..."
cat > deploy-package/server.js << 'EOL'
const { createServer } = require('http');
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
    console.log(`> Ready on http://localhost:${process.env.PORT || 3000}`);
  });
});
EOL

# 4. Create a package.json for the server
echo "Creating package.json for server..."
cat > deploy-package/package.json << 'EOL'
{
  "name": "learnbridge-edu",
  "version": "1.0.0",
  "description": "LearnBridge Education Platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "build": "cd frontend && npm install && npm run build"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  }
}
EOL

# 5. Create a .htaccess file for Hostinger
echo "Creating .htaccess file..."
cat > deploy-package/.htaccess << 'EOL'
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
EOL

echo "Deployment package created successfully!"
echo "Next steps:"
echo "1. Upload the contents of deploy-package to your Hostinger subdomain"
echo "2. SSH into your Hostinger account and run 'npm install' and 'npm start'"
echo "3. Set up a process manager like PM2 to keep your Node.js app running" 