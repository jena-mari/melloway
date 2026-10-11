import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/mobile-e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  use: {
    baseURL: process.env.MOBILE_E2E_URL || 'http://localhost:8084',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  webServer: process.env.MOBILE_E2E_URL ? undefined : {
    command: 'npm run mobile:web -- --port 8084 --localhost',
    url: 'http://localhost:8084',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { EXPO_PUBLIC_DATA_MODE: 'demo', EXPO_PUBLIC_API_URL: 'http://localhost:3001' },
  },
  reporter: 'list',
});
