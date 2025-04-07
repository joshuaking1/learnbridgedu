@echo off
echo Deployment script for Hostinger

REM 1. Create deployment package
echo Creating deployment package...
mkdir deploy-package\frontend

REM 2. Create a simple server.js file for Hostinger
echo Creating server.js file...
(
echo const { createServer } = require('http');
echo const { parse } = require('url');
echo const next = require('next');
echo.
echo const dev = process.env.NODE_ENV !== 'production';
echo const app = next({ dev });
echo const handle = app.getRequestHandler();
echo.
echo app.prepare().then(() =^> {
echo   createServer((req, res) =^> {
echo     const parsedUrl = parse(req.url, true);
echo     handle(req, res, parsedUrl);
echo   }).listen(process.env.PORT ^|^| 3000, (err) =^> {
echo     if (err) throw err;
echo     console.log('^> Ready on http://localhost:' + (process.env.PORT ^|^| 3000));
echo   });
echo });
) > server.js

REM 3. Create a package.json for the server
echo Creating package.json for server...
(
echo {
echo   "name": "learnbridge-edu",
echo   "version": "1.0.0",
echo   "description": "LearnBridge Education Platform",
echo   "main": "server.js",
echo   "scripts": {
echo     "start": "node server.js",
echo     "build": "cd frontend && npm install && npm run build"
echo   },
echo   "dependencies": {
echo     "next": "latest",
echo     "react": "latest",
echo     "react-dom": "latest"
echo   }
echo }
) > package.json

REM 4. Create a .htaccess file for Hostinger
echo Creating .htaccess file...
(
echo RewriteEngine On
echo RewriteRule ^$ http://127.0.0.1:3000/ [P,L]
echo RewriteCond %%{REQUEST_FILENAME} !-f
echo RewriteCond %%{REQUEST_FILENAME} !-d
echo RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
) > .htaccess

echo Deployment package created successfully!
echo Next steps:
echo 1. Upload the contents of this directory to your Hostinger subdomain
echo 2. SSH into your Hostinger account and run 'npm install' and 'npm start'
echo 3. Set up a process manager like PM2 to keep your Node.js app running 