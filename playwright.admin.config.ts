import { defineConfig, devices } from '@playwright/test'

/**
 * Authenticated admin proof suite (screenshots + axe). Separate from the main
 * E2E config because it needs a saved /admin session (login + 2FA).
 *
 * One-time login:
 *   npx playwright test --config playwright.admin.config.ts --project setup --headed
 * That opens a real browser; log in to /admin including the 2FA code. The
 * session is saved to .auth/admin.json (gitignored) and reused by every other
 * run:
 *   npx playwright test --config playwright.admin.config.ts --project desktop
 *   npx playwright test --config playwright.admin.config.ts --project mobile
 *
 * Runs against the local dev server (started automatically, or reused).
 */
const STORAGE = '.auth/admin.json'

export default defineConfig({
  testDir: './tests/admin-proof',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.ADMIN_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // Headed and slow so a human can complete login + 2FA.
      use: { headless: false },
    },
    {
      name: 'desktop',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE,
      },
    },
    {
      name: 'mobile',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        storageState: STORAGE,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
