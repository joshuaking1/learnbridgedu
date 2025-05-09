// Test Helper Functions
require('dotenv').config({ path: './testing/.env' });
const { Clerk } = require('@clerk/clerk-sdk-node');

// Initialize Clerk client
const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY
});

// Generate unique test email
function generateTestEmail() {
  return `test.user+${Date.now()}@example.com`;
}

// Get Clerk user metadata
async function getClerkUserMetadata(email) {
  const users = await clerk.users.getUserList({ emailAddress: [email] });
  if (users.length > 0) {
    return {
      unsafeMetadata: users[0].unsafeMetadata,
      publicMetadata: users[0].publicMetadata
    };
  }
  return null;
}

// Clean up test users
async function deleteTestUser(email) {
  const users = await clerk.users.getUserList({ emailAddress: [email] });
  if (users.length > 0) {
    await clerk.users.deleteUser(users[0].id);
  }
}

module.exports = {
  generateTestEmail,
  getClerkUserMetadata,
  deleteTestUser
};