// Test script for authentication middleware
require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Log environment variables (without sensitive values)
console.log('Environment check:');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('- CLERK_SECRET_KEY:', process.env.CLERK_SECRET_KEY ? 'Set' : 'Not set');
console.log('- IGNORE_TOKEN_EXPIRATION:', process.env.IGNORE_TOKEN_EXPIRATION);

// Function to test authentication
async function testAuthentication() {
  try {
    const baseUrl = 'http://localhost:3004'; // Adjust if your service is running on a different port
    
    // Test health endpoint (no auth required)
    console.log('\n1. Testing health endpoint (no auth required):');
    try {
      const healthResponse = await axios.get(`${baseUrl}/api/ai/health`);
      console.log('Health check successful:');
      console.log(JSON.stringify(healthResponse.data, null, 2));
    } catch (healthError) {
      console.error('Health check failed:', healthError.message);
      if (healthError.response) {
        console.error('Response:', healthError.response.data);
      }
    }
    
    // Create a JWT token with different algorithms
    if (process.env.JWT_SECRET) {
      // Test with HS256 algorithm
      console.log('\n2. Testing with HS256 algorithm:');
      const tokenHS256 = jwt.sign(
        { userId: 'test-user-123', role: 'admin' },
        process.env.JWT_SECRET,
        { 
          expiresIn: '1h',
          algorithm: 'HS256'
        }
      );
      
      console.log('Token created with HS256 algorithm');
      
      try {
        const response = await axios.get(`${baseUrl}/api/ai/limits/check`, {
          headers: {
            Authorization: `Bearer ${tokenHS256}`
          }
        });
        
        console.log('Authentication successful with HS256 token:');
        console.log(JSON.stringify(response.data, null, 2));
      } catch (authError) {
        console.error('Authentication failed with HS256 token:', authError.message);
        if (authError.response) {
          console.error('Response:', authError.response.data);
        }
      }
      
      // Test with HS512 algorithm
      console.log('\n3. Testing with HS512 algorithm:');
      const tokenHS512 = jwt.sign(
        { userId: 'test-user-456', role: 'admin' },
        process.env.JWT_SECRET,
        { 
          expiresIn: '1h',
          algorithm: 'HS512'
        }
      );
      
      console.log('Token created with HS512 algorithm');
      
      try {
        const response = await axios.get(`${baseUrl}/api/ai/limits/check`, {
          headers: {
            Authorization: `Bearer ${tokenHS512}`
          }
        });
        
        console.log('Authentication successful with HS512 token:');
        console.log(JSON.stringify(response.data, null, 2));
      } catch (authError) {
        console.error('Authentication failed with HS512 token:', authError.message);
        if (authError.response) {
          console.error('Response:', authError.response.data);
        }
      }
      
      // Test with expired token
      console.log('\n4. Testing with expired token:');
      const tokenExpired = jwt.sign(
        { userId: 'test-user-789', role: 'admin' },
        process.env.JWT_SECRET,
        { 
          expiresIn: '-1h', // Expired 1 hour ago
          algorithm: 'HS256'
        }
      );
      
      console.log('Expired token created');
      
      try {
        const response = await axios.get(`${baseUrl}/api/ai/limits/check`, {
          headers: {
            Authorization: `Bearer ${tokenExpired}`
          }
        });
        
        console.log('Authentication successful with expired token (should only happen if IGNORE_TOKEN_EXPIRATION=true):');
        console.log(JSON.stringify(response.data, null, 2));
      } catch (authError) {
        console.error('Authentication failed with expired token:', authError.message);
        if (authError.response) {
          console.error('Response:', authError.response.data);
        }
      }
    } else {
      console.log('\nSkipping JWT tests: JWT_SECRET not defined');
    }
  } catch (error) {
    console.error('Error testing authentication:', error);
  }
}

// Run the test
console.log('Starting authentication tests...');
console.log('Make sure your AI service is running on http://localhost:3004');
testAuthentication();
