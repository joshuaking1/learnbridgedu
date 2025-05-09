# Test info

- Name: Role-Based Access Control Tests >> Teacher should not access student-only routes
- Location: C:\Users\kingo\OneDrive\Documents\learnbridge-edu\testing\role-based-access.spec.js:66:3

# Error details

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#firstName')

    at C:\Users\kingo\OneDrive\Documents\learnbridge-edu\testing\role-based-access.spec.js:69:16
```

# Page snapshot

```yaml
- button "Open Next.js Dev Tools":
  - img
- button "Open issues overlay": 1 Issue
- dialog "Build Error":
  - text: Build Error
  - button "Copy Stack Trace":
    - img
  - link "Go to related documentation":
    - /url: https://nextjs.org/docs/app/api-reference/directives/use-client
    - img
  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools":
    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
    - img
  - paragraph: "Error: × You're importing a component that needs `useRouter`. This React hook only works in a client component. To fix, mark the file (or its parent) with the `\"use client\"` directive."
  - img
  - text: ./src/app/sign-up/[[...sign-up]]/page.tsx
  - button "Open in editor":
    - img
  - text: "Error: × You're importing a component that needs `useRouter`. This React hook only works in a client component. To fix, mark the file (or its parent) with the `\"use client\"` directive. │ │ Learn more:"
  - link "https://nextjs.org/docs/app/api-reference/directives/use-client":
    - /url: https://nextjs.org/docs/app/api-reference/directives/use-client
  - text: "│ │ ╭─[C:\\Users\\kingo\\OneDrive\\Documents\\learnbridge-edu\\frontend\\src\\app\\sign-up\\[[...sign-up]]\\page.tsx:3:1] 1 │ import { RoleSelection } from \"@/components/auth/RoleSelection\"; 2 │ import { useSignUp } from \"@clerk/nextjs\"; 3 │ import { useRouter } from \"next/navigation\"; · ───────── 4 │ import { useState } from \"react\"; 5 │ 6 │ export default function SignUpPage() { ╰──── × You're importing a component that needs `useState`. This React hook only works in a client component. To fix, mark the file (or its parent) with the `\"use client\"` directive. │ │ Learn more:"
  - link "https://nextjs.org/docs/app/api-reference/directives/use-client":
    - /url: https://nextjs.org/docs/app/api-reference/directives/use-client
  - text: "│ │ ╭─[C:\\Users\\kingo\\OneDrive\\Documents\\learnbridge-edu\\frontend\\src\\app\\sign-up\\[[...sign-up]]\\page.tsx:4:1] 1 │ import { RoleSelection } from \"@/components/auth/RoleSelection\"; 2 │ import { useSignUp } from \"@clerk/nextjs\"; 3 │ import { useRouter } from \"next/navigation\"; 4 │ import { useState } from \"react\"; · ──────── 5 │ 6 │ export default function SignUpPage() { 7 │ const router = useRouter(); ╰────"
  - contentinfo:
    - paragraph: This error occurred during the build process and can only be dismissed by fixing the error.
- navigation:
  - button "previous" [disabled]:
    - img "previous"
  - text: 1/1
  - button "next" [disabled]:
    - img "next"
- img
- link "Next.js 15.2.4 (stale)":
  - /url: https://nextjs.org/docs/messages/version-staleness
  - img
  - text: Next.js 15.2.4 (stale)
- img
- alert
```

# Test source

```ts
   1 | const { test, expect } = require('@playwright/test');
   2 | const { generateTestEmail, deleteTestUser } = require('./test-helpers');
   3 | const config = require('./test-config');
   4 |
   5 | test.describe('Role-Based Access Control Tests', () => {
   6 |   let teacherUser;
   7 |   let studentUser;
   8 |
   9 |   test.beforeEach(async () => {
   10 |     teacherUser = {
   11 |       ...config.testUsers.teacher,
   12 |       email: generateTestEmail()
   13 |     };
   14 |     studentUser = {
   15 |       ...config.testUsers.student,
   16 |       email: generateTestEmail()
   17 |     };
   18 |   });
   19 |
   20 |   test.afterEach(async () => {
   21 |     await deleteTestUser(teacherUser.email);
   22 |     await deleteTestUser(studentUser.email);
   23 |   });
   24 |
   25 |   test('Teacher should access teacher-only routes', async ({ page }) => {
   26 |     // Arrange - Sign up as teacher
   27 |     await page.goto(config.baseUrl + '/sign-up');
   28 |     await page.waitForSelector('#firstName', { state: 'visible' });
   29 |     await page.fill('#firstName', teacherUser.firstName);
   30 |     await page.waitForSelector('#lastName', { state: 'visible' });
   31 |     await page.fill('#lastName', teacherUser.lastName);
   32 |     await page.waitForSelector('#email', { state: 'visible' });
   33 |     await page.fill('#email', teacherUser.email);
   34 |     await page.waitForSelector('#password', { state: 'visible' });
   35 |     await page.fill('#password', teacherUser.password);
   36 |     await page.click(`#${teacherUser.role}`);
   37 |     await page.click('button[type="submit"]');
   38 |     await expect(page).toHaveURL(/\/dashboard/);
   39 |
   40 |     // Act - Access teacher-only route
   41 |     await page.goto(config.baseUrl + '/dashboard/teacher-only');
   42 |
   43 |     // Assert
   44 |     await expect(page).toHaveURL(/\/dashboard\/teacher-only/);
   45 |   });
   46 |
   47 |   test('Student should not access teacher-only routes', async ({ page }) => {
   48 |     // Arrange - Sign up as student
   49 |     await page.goto(config.baseUrl + '/sign-up');
   50 |     await page.fill('#firstName', studentUser.firstName);
   51 |     await page.fill('#lastName', studentUser.lastName);
   52 |     await page.fill('#email', studentUser.email);
   53 |     await page.fill('#password', studentUser.password);
   54 |     await page.click(`#${studentUser.role}`);
   55 |     await page.click('button[type="submit"]');
   56 |     await expect(page).toHaveURL(/\/dashboard/);
   57 |
   58 |     // Act - Access teacher-only route
   59 |     await page.goto(config.baseUrl + '/dashboard/teacher-only');
   60 |
   61 |     // Assert
   62 |     await expect(page.locator('.text-red-500')).toBeVisible();
   63 |     await expect(page.locator('.text-red-500')).toContainText('Forbidden');
   64 |   });
   65 |
   66 |   test('Teacher should not access student-only routes', async ({ page }) => {
   67 |     // Arrange - Sign up as teacher
   68 |     await page.goto(config.baseUrl + '/sign-up');
>  69 |     await page.fill('#firstName', teacherUser.firstName);
      |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
   70 |     await page.fill('#lastName', teacherUser.lastName);
   71 |     await page.fill('#email', teacherUser.email);
   72 |     await page.fill('#password', teacherUser.password);
   73 |     await page.click(`#${teacherUser.role}`);
   74 |     await page.click('button[type="submit"]');
   75 |     await expect(page).toHaveURL(/\/dashboard/);
   76 |
   77 |     // Act - Access student-only route
   78 |     await page.goto(config.baseUrl + '/dashboard/student-only');
   79 |
   80 |     // Assert
   81 |     await expect(page.locator('.text-red-500')).toBeVisible();
   82 |     await expect(page.locator('.text-red-500')).toContainText('Forbidden');
   83 |   });
   84 |
   85 |   test('Student should access student-only routes', async ({ page }) => {
   86 |     // Arrange - Sign up as student
   87 |     await page.goto(config.baseUrl + '/sign-up');
   88 |     await page.fill('#firstName', studentUser.firstName);
   89 |     await page.fill('#lastName', studentUser.lastName);
   90 |     await page.fill('#email', studentUser.email);
   91 |     await page.fill('#password', studentUser.password);
   92 |     await page.click(`#${studentUser.role}`);
   93 |     await page.click('button[type="submit"]');
   94 |     await expect(page).toHaveURL(/\/dashboard/);
   95 |
   96 |     // Act - Access student-only route
   97 |     await page.goto(config.baseUrl + '/dashboard/student-only');
   98 |
   99 |     // Assert
  100 |     await expect(page).toHaveURL(/\/dashboard\/student-only/);
  101 |   });
  102 | });
```