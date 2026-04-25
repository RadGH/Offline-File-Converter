import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5280',
    trace: 'on-first-retry',
    // Pre-seed sessionStorage with coi-reloaded=1 so the COI service worker
    // skips its one-time page reload during tests (the reload would interrupt
    // page.evaluate() calls and DOM assertions mid-test).
    storageState: './tests/e2e/storage-state.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5280',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
