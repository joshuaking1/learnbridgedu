// Test Environment Configuration
module.exports = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  },
  testUsers: {
    teacher: {
      firstName: 'Test',
      lastName: 'Teacher',
      password: 'ValidPassword123!',
      role: 'teacher'
    },
    student: {
      firstName: 'Test',
      lastName: 'Student',
      password: 'ValidPassword123!',
      role: 'student'
    }
  },
  testTimeout: 30000 // 30 seconds
};