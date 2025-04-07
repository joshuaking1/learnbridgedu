#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting LearnBridge deployment setup...');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
    console.error('Error: package.json not found. Please run this script from the project root directory.');
    process.exit(1);
}

// Create server.js if it doesn't exist
const serverContent = `const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

app.prepare().then(() => {
    createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    }).listen(port, (err) => {
        if (err) throw err;
        console.log('> Ready on http://localhost:' + port);
    });
});`;

fs.writeFileSync('server.js', serverContent);
console.log('✓ Created server.js');

// Create .htaccess if it doesn't exist
const htaccessContent = `RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]`;

fs.writeFileSync('.htaccess', htaccessContent);
console.log('✓ Created .htaccess');

// Create .env.example if it doesn't exist
const envExampleContent = `NODE_ENV=production
PORT=3000
# Add your environment variables below
# DATABASE_URL=
# API_KEY=`;

fs.writeFileSync('.env.example', envExampleContent);
console.log('✓ Created .env.example');

console.log('\nSetup complete! Next steps:');
console.log('1. Upload all files to your Hostinger subdomain');
console.log('2. Follow the instructions in HOSTINGER_DEPLOYMENT_GUIDE.md'); 