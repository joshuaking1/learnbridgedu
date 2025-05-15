// Test script for JWT algorithm verification
require('dotenv').config();
const jwt = require('jsonwebtoken');

// Log environment variables (without sensitive values)
console.log('Environment check:');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');

// Function to test JWT algorithm verification
function testJwtAlgorithmVerification() {
  try {
    console.log('Testing JWT verification with different algorithms');
    
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in environment variables');
      process.exit(1);
    }
    
    const JWT_SECRET = process.env.JWT_SECRET;
    
    // Test with default algorithm (HS256)
    console.log('\n1. Testing with default algorithm (HS256):');
    const tokenHS256 = jwt.sign(
      { userId: 'test-user-123', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    console.log('Token created with default algorithm (HS256)');
    
    try {
      const decodedHS256 = jwt.verify(tokenHS256, JWT_SECRET);
      console.log('Successfully verified token:');
      console.log(JSON.stringify(decodedHS256, null, 2));
      
      // Check the algorithm used
      const decodedHeader = JSON.parse(
        Buffer.from(tokenHS256.split('.')[0], 'base64').toString()
      );
      console.log('Token header:');
      console.log(JSON.stringify(decodedHeader, null, 2));
    } catch (error) {
      console.error('Error verifying token:', error);
    }
    
    // Test with explicit HS256 algorithm
    console.log('\n2. Testing with explicit HS256 algorithm:');
    const tokenExplicitHS256 = jwt.sign(
      { userId: 'test-user-456', role: 'admin' },
      JWT_SECRET,
      { 
        expiresIn: '1h',
        algorithm: 'HS256'
      }
    );
    
    console.log('Token created with explicit HS256 algorithm');
    
    try {
      const decodedExplicitHS256 = jwt.verify(tokenExplicitHS256, JWT_SECRET);
      console.log('Successfully verified token:');
      console.log(JSON.stringify(decodedExplicitHS256, null, 2));
      
      // Check the algorithm used
      const decodedHeader = JSON.parse(
        Buffer.from(tokenExplicitHS256.split('.')[0], 'base64').toString()
      );
      console.log('Token header:');
      console.log(JSON.stringify(decodedHeader, null, 2));
    } catch (error) {
      console.error('Error verifying token:', error);
    }
    
    // Test with HS512 algorithm
    console.log('\n3. Testing with HS512 algorithm:');
    const tokenHS512 = jwt.sign(
      { userId: 'test-user-789', role: 'admin' },
      JWT_SECRET,
      { 
        expiresIn: '1h',
        algorithm: 'HS512'
      }
    );
    
    console.log('Token created with HS512 algorithm');
    
    try {
      const decodedHS512 = jwt.verify(tokenHS512, JWT_SECRET);
      console.log('Successfully verified token:');
      console.log(JSON.stringify(decodedHS512, null, 2));
      
      // Check the algorithm used
      const decodedHeader = JSON.parse(
        Buffer.from(tokenHS512.split('.')[0], 'base64').toString()
      );
      console.log('Token header:');
      console.log(JSON.stringify(decodedHeader, null, 2));
    } catch (error) {
      console.error('Error verifying token:', error);
    }
    
    // Test with HS512 algorithm but verify with explicit HS256
    console.log('\n4. Testing with HS512 algorithm but verify with explicit HS256:');
    
    try {
      const decodedHS512WithHS256 = jwt.verify(tokenHS512, JWT_SECRET, {
        algorithms: ['HS256']
      });
      console.log('Successfully verified token (unexpected):');
      console.log(JSON.stringify(decodedHS512WithHS256, null, 2));
    } catch (error) {
      console.error('Error verifying token (expected):', error.message);
    }
    
    // Test with HS512 algorithm but verify with explicit HS512
    console.log('\n5. Testing with HS512 algorithm and verify with explicit HS512:');
    
    try {
      const decodedHS512WithHS512 = jwt.verify(tokenHS512, JWT_SECRET, {
        algorithms: ['HS512']
      });
      console.log('Successfully verified token:');
      console.log(JSON.stringify(decodedHS512WithHS512, null, 2));
    } catch (error) {
      console.error('Error verifying token:', error.message);
    }
    
    // Test with none algorithm (should fail)
    console.log('\n6. Testing with "none" algorithm (should fail):');
    try {
      const tokenNone = jwt.sign(
        { userId: 'test-user-999', role: 'admin' },
        JWT_SECRET,
        { 
          expiresIn: '1h',
          algorithm: 'none'
        }
      );
      
      console.log('Token created with "none" algorithm');
      
      try {
        const decodedNone = jwt.verify(tokenNone, JWT_SECRET);
        console.log('Successfully verified token (unexpected):');
        console.log(JSON.stringify(decodedNone, null, 2));
      } catch (error) {
        console.error('Error verifying token (expected):', error.message);
      }
    } catch (error) {
      console.error('Error creating token with "none" algorithm (expected):', error.message);
    }
  } catch (error) {
    console.error('Error testing JWT algorithm verification:', error);
  }
}

// Run the test
testJwtAlgorithmVerification();
