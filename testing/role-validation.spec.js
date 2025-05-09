const { test, expect } = require('@playwright/test');
const { generateTestEmail, deleteTestUser } = require('./test-helpers');
const config = require('./test-config');

test.describe('Role Validation Tests', () => {
  let testUser;

  test.beforeEach(() => {
    testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: generateTestEmail(),
      password: 'ValidPassword123!'
    };
  });

  test.afterEach(async () => {
    await deleteTestUser(testUser.email);
  });

  test('Empty role selection should show error', async ({ page }) => {
    // Arrange
    await page.goto(config.baseUrl + '/sign-up');

    // Act
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('Please select a role');
  });

  test('Invalid role selection should show error', async ({ page }) => {
    // Arrange
    await page.goto(config.baseUrl + '/sign-up');

    // Act
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.evaluate(() => {
      document.querySelector('#teacher').value = 'invalid_role';
    });
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('Invalid role selection');
  });
});