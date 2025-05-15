// Test script for token leeway
require('dotenv').config();
const { Clerk } = require('@clerk/clerk-sdk-node');

// Initialize Clerk client
if (!process.env.CLERK_SECRET_KEY) {
  console.error('CLERK_SECRET_KEY is not defined in environment variables');
  process.exit(1);
}

const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Sample token to test (replace with an actual token)
const sampleToken = 'YOUR_TEST_TOKEN_HERE';

async function testTokenVerification() {
  try {
    console.log('Testing token verification with no leeway...');
    try {
      const claims1 = await clerk.verifyToken(sampleToken);
      console.log('Token verified successfully without leeway:', claims1);
    } catch (error) {
      console.error('Error verifying token without leeway:', error);
    }

    console.log('\nTesting token verification with 10-second leeway...');
    try {
      const claims2 = await clerk.verifyToken(sampleToken, { leeway: 10 });
      console.log('Token verified successfully with 10-second leeway:', claims2);
    } catch (error) {
      console.error('Error verifying token with 10-second leeway:', error);
    }

    console.log('\nTesting token verification with 30-second leeway...');
    try {
      const claims3 = await clerk.verifyToken(sampleToken, { leeway: 30 });
      console.log('Token verified successfully with 30-second leeway:', claims3);
    } catch (error) {
      console.error('Error verifying token with 30-second leeway:', error);
    }
  } catch (error) {
    console.error('Unexpected error during test:', error);
  }
}

testTokenVerification();