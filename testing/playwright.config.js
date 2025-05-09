const config = require('./test-config');
const path = require('path');

module.exports = {
  testDir: path.join(__dirname, './testing'),
  testMatch: '**/*.spec.js',
  timeout: config.testTimeout,
  use: {
    baseURL: config.baseUrl,
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'Chrome',
      use: { browserName: 'chromium' }
    },
    {
      name: 'Firefox',
      use: { browserName: 'firefox' }
    },
    {
      name: 'WebKit',
      use: { browserName: 'webkit' }
    }
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ]
};