// scripts/update-services-for-clerk.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  // List of services to update
  services: [
    'user-service',
    'teacher-tools-service',
    'ai-service',
    'quiz-service',
    'notification-service',
    'content-service',
  ],
  // Path to the services directory
  servicesDir: path.join(__dirname, '..', 'services'),
  // Path to the shared middleware directory
  sharedDir: path.join(__dirname, '..', 'services', 'shared', 'middleware'),
  // Clerk middleware file
  clerkMiddlewarePath: path.join(__dirname, '..', 'services', 'shared', 'middleware', 'clerkAuthMiddleware.js'),
};

// Function to check if a directory exists
function directoryExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
}

// Function to check if a file exists
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
}

// Function to create a backup of a file
function backupFile(filePath) {
  if (fileExists(filePath)) {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`Created backup: ${backupPath}`);
    return backupPath;
  }
  return null;
}

// Function to update package.json to include Clerk
function updatePackageJson(servicePath) {
  const packageJsonPath = path.join(servicePath, 'package.json');
  
  if (!fileExists(packageJsonPath)) {
    console.log(`No package.json found in ${servicePath}`);
    return false;
  }
  
  // Backup the file
  backupFile(packageJsonPath);
  
  try {
    // Read and parse package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Add Clerk dependency if it doesn't exist
    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }
    
    if (!packageJson.dependencies['@clerk/clerk-sdk-node']) {
      packageJson.dependencies['@clerk/clerk-sdk-node'] = '^4.10.0';
      console.log(`Added @clerk/clerk-sdk-node to dependencies in ${packageJsonPath}`);
    } else {
      console.log(`@clerk/clerk-sdk-node already exists in ${packageJsonPath}`);
    }
    
    // Write updated package.json
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`Updated ${packageJsonPath}`);
    
    return true;
  } catch (error) {
    console.error(`Error updating ${packageJsonPath}:`, error);
    return false;
  }
}

// Function to update .env file to include Clerk variables
function updateEnvFile(servicePath) {
  const envPath = path.join(servicePath, '.env');
  const envExamplePath = path.join(servicePath, '.env.example');
  
  // Create .env file if it doesn't exist
  if (!fileExists(envPath) && fileExists(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log(`Created .env from .env.example in ${servicePath}`);
  } else if (!fileExists(envPath)) {
    fs.writeFileSync(envPath, '# Environment Variables\n');
    console.log(`Created new .env file in ${servicePath}`);
  } else {
    // Backup the file
    backupFile(envPath);
  }
  
  try {
    // Read .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Add Clerk variables if they don't exist
    const clerkVars = [
      'CLERK_SECRET_KEY',
      'CLERK_PUBLISHABLE_KEY',
    ];
    
    let updated = false;
    
    // Check if Clerk section exists
    if (!envContent.includes('# Clerk Authentication')) {
      envContent += '\n\n# Clerk Authentication\n';
      updated = true;
    }
    
    // Add each Clerk variable if it doesn't exist
    clerkVars.forEach(varName => {
      if (!envContent.includes(`${varName}=`)) {
        envContent += `${varName}=\n`;
        updated = true;
      }
    });
    
    if (updated) {
      // Write updated .env file
      fs.writeFileSync(envPath, envContent);
      console.log(`Updated ${envPath} with Clerk variables`);
    } else {
      console.log(`Clerk variables already exist in ${envPath}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error updating ${envPath}:`, error);
    return false;
  }
}

// Function to copy Clerk middleware to a service
function copyClerkMiddleware(servicePath) {
  const middlewareDir = path.join(servicePath, 'middleware');
  
  // Create middleware directory if it doesn't exist
  if (!directoryExists(middlewareDir)) {
    fs.mkdirSync(middlewareDir, { recursive: true });
    console.log(`Created middleware directory in ${servicePath}`);
  }
  
  const targetPath = path.join(middlewareDir, 'clerkAuthMiddleware.js');
  
  // Skip if file already exists
  if (fileExists(targetPath)) {
    console.log(`Clerk middleware already exists in ${servicePath}`);
    return true;
  }
  
  try {
    // Copy the Clerk middleware file
    fs.copyFileSync(config.clerkMiddlewarePath, targetPath);
    console.log(`Copied Clerk middleware to ${targetPath}`);
    return true;
  } catch (error) {
    console.error(`Error copying Clerk middleware to ${servicePath}:`, error);
    return false;
  }
}

// Function to install dependencies
function installDependencies(servicePath) {
  try {
    console.log(`Installing dependencies in ${servicePath}...`);
    execSync('npm install', { cwd: servicePath, stdio: 'inherit' });
    console.log(`Dependencies installed in ${servicePath}`);
    return true;
  } catch (error) {
    console.error(`Error installing dependencies in ${servicePath}:`, error);
    return false;
  }
}

// Main function to update all services
async function updateServices() {
  console.log('Starting service updates for Clerk integration...');
  
  // Check if the Clerk middleware file exists
  if (!fileExists(config.clerkMiddlewarePath)) {
    console.error(`Clerk middleware file not found at ${config.clerkMiddlewarePath}`);
    return false;
  }
  
  // Process each service
  for (const serviceName of config.services) {
    const servicePath = path.join(config.servicesDir, serviceName);
    
    if (!directoryExists(servicePath)) {
      console.log(`Service directory not found: ${servicePath}`);
      continue;
    }
    
    console.log(`\nUpdating service: ${serviceName}`);
    console.log('='.repeat(50));
    
    // Update package.json
    updatePackageJson(servicePath);
    
    // Update .env file
    updateEnvFile(servicePath);
    
    // Copy Clerk middleware
    copyClerkMiddleware(servicePath);
    
    // Install dependencies
    installDependencies(servicePath);
    
    console.log(`Completed updates for ${serviceName}`);
  }
  
  console.log('\nAll services have been updated for Clerk integration!');
  console.log('Next steps:');
  console.log('1. Add your Clerk API keys to each service\'s .env file');
  console.log('2. Update server.js files to use the new Clerk middleware');
  console.log('3. Test each service to ensure authentication works correctly');
  
  return true;
}

// Run the update if this script is executed directly
if (require.main === module) {
  updateServices()
    .then(success => {
      if (success) {
        console.log('Service update script completed successfully');
        process.exit(0);
      } else {
        console.error('Service update script completed with errors');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Service update script failed:', error);
      process.exit(1);
    });
}

module.exports = { updateServices };
