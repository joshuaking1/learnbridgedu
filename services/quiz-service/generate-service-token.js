// services/quiz-service/generate-service-token.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Check if JWT_SECRET is available
if (!process.env.JWT_SECRET) {
    console.error('Error: JWT_SECRET is not defined in the .env file');
    process.exit(1);
}

// Create a service token with admin privileges that doesn't expire
const serviceToken = jwt.sign(
    { 
        userId: 'quiz-service', 
        role: 'service',
        serviceId: 'quiz-service',
        permissions: ['generate_quizzes']
    },
    process.env.JWT_SECRET,
    { expiresIn: '1y' } // 1 year expiration
);

console.log('Service Token generated successfully:');
console.log(serviceToken);

// Update the .env file with the new token
const envContent = fs.readFileSync('.env', 'utf8');
const updatedEnvContent = envContent.includes('SERVICE_TOKEN=')
    ? envContent.replace(/SERVICE_TOKEN=.*(\r?\n|$)/g, `SERVICE_TOKEN=${serviceToken}$1`)
    : envContent + `\nSERVICE_TOKEN=${serviceToken}\n`;

fs.writeFileSync('.env', updatedEnvContent);
console.log('\nThe SERVICE_TOKEN has been added to your .env file.');
console.log('The quiz service will now be able to authenticate with the AI service.');
