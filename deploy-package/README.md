# LearnBridge Education Platform - Deployment Package

This package contains all the necessary files to deploy your LearnBridge Education Platform to a Hostinger subdomain.

## Files Included

- `server.js` - The Node.js server file that runs your Next.js application
- `package.json` - Dependencies and scripts for your application
- `.htaccess` - Apache configuration for proxying requests to your Node.js server
- `.env.example` - Template for environment variables
- `HOSTINGER_DEPLOYMENT_GUIDE.md` - Detailed guide for deploying to Hostinger
- `setup-hostinger.js` - Helper script to set up your project for Hostinger

## Quick Start

1. Upload all files in this directory to your Hostinger subdomain's root directory (usually `/public_html/`)
2. SSH into your Hostinger account
3. Navigate to your subdomain directory
4. Run the following commands:
   ```
   npm install
   npm install -g pm2
   pm2 start server.js --name "learnbridge"
   pm2 startup
   pm2 save
   ```
5. Create a `.env` file based on `.env.example` with your actual configuration values
6. Restart your application:
   ```
   pm2 restart learnbridge
   ```

## Detailed Instructions

For detailed step-by-step instructions, please refer to the `HOSTINGER_DEPLOYMENT_GUIDE.md` file.

## Troubleshooting

If you encounter any issues during deployment, check the troubleshooting section in the `HOSTINGER_DEPLOYMENT_GUIDE.md` file.

## Additional Resources

- [Hostinger Node.js Documentation](https://www.hostinger.com/tutorials/how-to-install-node-js-on-hosting)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment) 