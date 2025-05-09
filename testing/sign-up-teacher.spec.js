const { test, expect } = require('@playwright/test');
const { generateTestEmail, getClerkUserMetadata, deleteTestUser } = require('./test-helpers');
const config = require('./test-config');

test.describe('Teacher Sign-up Flow', () => {
  let testUser;

  test.beforeEach(() => {
    testUser = {
      ...config.testUsers.teacher,
      email: generateTestEmail()
    };
  });

  test.afterEach(async () => {
    await deleteTestUser(testUser.email);
  });

  test('Successful sign-up with teacher role', async ({ page }) => {
    // Arrange
    await page.goto(config.baseUrl + '/sign-up');

    // Act
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click(`#${testUser.role}`);
    await page.click('button[type="submit"]');

    // Assert
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Verify role in metadata
    const metadata = await getClerkUserMetadata(testUser.email);
    expect(metadata.unsafeMetadata.role).toBe(testUser.role);
    expect(metadata.publicMetadata.role).toBe(testUser.role);
  });
});