import { defineConfig, devices } from '@playwright/test'

/**
 * Production smoke configuration.
 *
 * Runs *.production.spec.ts files against the live production URL
 * (default https://www.eventlinqs.com, override with E2E_BASE_URL).
 * Intentionally has NO webServer block - we do not want to spin up a
 * local Next server when probing production.
 *
 * Used by .github/workflows/post-deploy-smoke.yml. Locally:
 *   npx playwright test --config=playwright.smoke.config.ts
 * Optionally filter by tag:
 *   npx playwright test --config=playwright.smoke.config.ts --grep @smoke
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.production.spec.ts'],
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://www.eventlinqs.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
})
