const { test, expect } = require('@playwright/test');
const { generateTestEmail, deleteTestUser } = require('./test-helpers');
const config = require('./test-config');

test.describe('Error Scenario Tests', () => {
  let testUser;

  test.beforeEach(() => {
    testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: generateTestEmail(),
      password: 'ValidPassword123!',
      role: 'teacher'
    };
  });

  test.afterEach(async () => {
    await deleteTestUser(testUser.email);
  });

  test('Sign-up with missing required fields should show errors', async ({ page }) => {
    // Arrange
    await page.goto(config.baseUrl + '/sign-up');

    // Act
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('.text-red-500')).toHaveCount(4); // 4 required fields
  });

  test('Duplicate email sign-up should show error', async ({ page }) => {
    // Arrange - First sign-up
    await page.goto(config.baseUrl + '/sign-up');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click(`#${testUser.role}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Act - Second sign-up with same email
    await page.goto(config.baseUrl + '/sign-up');
    await page.fill('#firstName', 'Another');
    await page.fill('#lastName', 'User');
    await page.fill('#email', testUser.email);
    await page.fill('#password', 'AnotherPassword123!');
    await page.click(`#${testUser.role}`);
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('already exists');
  });

  test('Weak password validation should show error', async ({ page }) => {
    // Arrange
    await page.goto(config.baseUrl + '/sign-up');

    // Act
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', 'weak');
    await page.click(`#${testUser.role}`);
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('Password is too weak');
  });
});