const { test, expect } = require('@playwright/test');
const { generateTestEmail, deleteTestUser } = require('./test-helpers');
const config = require('./test-config');

test.describe('Role-Based Access Control Tests', () => {
  let teacherUser;
  let studentUser;

  test.beforeEach(async () => {
    teacherUser = {
      ...config.testUsers.teacher,
      email: generateTestEmail()
    };
    studentUser = {
      ...config.testUsers.student,
      email: generateTestEmail()
    };
  });

  test.afterEach(async () => {
    await deleteTestUser(teacherUser.email);
    await deleteTestUser(studentUser.email);
  });

  test('Teacher should access teacher-only routes', async ({ page }) => {
    // Arrange - Sign up as teacher
    await page.goto(config.baseUrl + '/sign-up');
    await page.waitForSelector('#firstName', { state: 'visible' });
    await page.fill('#firstName', teacherUser.firstName);
    await page.waitForSelector('#lastName', { state: 'visible' });
    await page.fill('#lastName', teacherUser.lastName);
    await page.waitForSelector('#email', { state: 'visible' });
    await page.fill('#email', teacherUser.email);
    await page.waitForSelector('#password', { state: 'visible' });
    await page.fill('#password', teacherUser.password);
    await page.click(`#${teacherUser.role}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Act - Access teacher-only route
    await page.goto(config.baseUrl + '/dashboard/teacher-only');

    // Assert
    await expect(page).toHaveURL(/\/dashboard\/teacher-only/);
  });

  test('Student should not access teacher-only routes', async ({ page }) => {
    // Arrange - Sign up as student
    await page.goto(config.baseUrl + '/sign-up');
    await page.fill('#firstName', studentUser.firstName);
    await page.fill('#lastName', studentUser.lastName);
    await page.fill('#email', studentUser.email);
    await page.fill('#password', studentUser.password);
    await page.click(`#${studentUser.role}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Act - Access teacher-only route
    await page.goto(config.baseUrl + '/dashboard/teacher-only');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('Forbidden');
  });

  test('Teacher should not access student-only routes', async ({ page }) => {
    // Arrange - Sign up as teacher
    await page.goto(config.baseUrl + '/sign-up');
    await page.fill('#firstName', teacherUser.firstName);
    await page.fill('#lastName', teacherUser.lastName);
    await page.fill('#email', teacherUser.email);
    await page.fill('#password', teacherUser.password);
    await page.click(`#${teacherUser.role}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Act - Access student-only route
    await page.goto(config.baseUrl + '/dashboard/student-only');

    // Assert
    await expect(page.locator('.text-red-500')).toBeVisible();
    await expect(page.locator('.text-red-500')).toContainText('Forbidden');
  });

  test('Student should access student-only routes', async ({ page }) => {
    // Arrange - Sign up as student
    await page.goto(config.baseUrl + '/sign-up');
    await page.fill('#firstName', studentUser.firstName);
    await page.fill('#lastName', studentUser.lastName);
    await page.fill('#email', studentUser.email);
    await page.fill('#password', studentUser.password);
    await page.click(`#${studentUser.role}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    // Act - Access student-only route
    await page.goto(config.baseUrl + '/dashboard/student-only');

    // Assert
    await expect(page).toHaveURL(/\/dashboard\/student-only/);
  });
});