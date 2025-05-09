/**
 * Script to install dependencies for all services
 * This script is called by the postinstall script in the root package.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the services directory
const servicesDir = path.join(__dirname, '..', 'services');

// Get all directories in the services directory
const services = fs.readdirSync(servicesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

console.log('Installing dependencies for all services...');

// Install dependencies for each service
services.forEach(service => {
  const serviceDir = path.join(servicesDir, service);
  const packageJsonPath = path.join(serviceDir, 'package.json');
  
  // Check if the service has a package.json file
  if (fs.existsSync(packageJsonPath)) {
    console.log(`Installing dependencies for ${service}...`);
    try {
      // Run npm install in the service directory
      execSync('npm install', { 
        cwd: serviceDir, 
        stdio: 'inherit' 
      });
      console.log(`Successfully installed dependencies for ${service}`);
    } catch (error) {
      console.error(`Error installing dependencies for ${service}:`, error.message);
    }
  } else {
    console.log(`Skipping ${service} - no package.json found`);
  }
});

console.log('Finished installing dependencies for all services');

// Check if all services have the Clerk SDK installed
console.log('\nChecking for Clerk SDK in all services...');

const missingClerkSdk = [];

services.forEach(service => {
  const serviceDir = path.join(servicesDir, service);
  const packageJsonPath = path.join(serviceDir, 'package.json');
  
  // Skip services without a package.json
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }
  
  // Read the package.json file
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Check if the Clerk SDK is in the dependencies
  const hasClerkSdk = packageJson.dependencies && 
                     (packageJson.dependencies['@clerk/clerk-sdk-node'] !== undefined);
  
  if (!hasClerkSdk) {
    missingClerkSdk.push(service);
  }
});

if (missingClerkSdk.length > 0) {
  console.warn('\nWARNING: The following services do not have the Clerk SDK installed:');
  missingClerkSdk.forEach(service => console.warn(`- ${service}`));
  console.warn('\nYou may need to add the Clerk SDK to these services if they need authentication.');
} else {
  console.log('All services have the Clerk SDK installed.');
}
