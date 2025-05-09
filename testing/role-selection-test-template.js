// Role Selection System Test Template
const { test, expect } = require('@playwright/test');

test.describe('Role Selection System Tests', () => {
  let testUser;
  
  test.beforeEach(async ({ page }) => {
    // Initialize test data
    testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: `test.user+${Date.now()}@example.com`,
      password: 'ValidPassword123!',
      role: null
    };
  });

  test('Template Test Case', async ({ page }) => {
    // Arrange
    testUser.role = 'teacher'; // or 'student'
    
    // Act
    await page.goto('/sign-up');
    
    // Fill sign-up form
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    
    // Select role
    await page.click(`#${testUser.role}`);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Assert
    await expect(page).toHaveURL('/dashboard');
    
    // Verify role in metadata
    const userMetadata = await getClerkUserMetadata(testUser.email);
    expect(userMetadata.role).toBe(testUser.role);
  });

  async function getClerkUserMetadata(email) {
    // Implementation to fetch Clerk user metadata
    // This would use Clerk's API or SDK
    return { role: 'teacher' }; // Placeholder
  }
});