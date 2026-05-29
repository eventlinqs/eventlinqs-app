import { defineConfig, devices } from '@playwright/test'

// Verifies the proxy.ts queue-gate change does not regress event-detail
// rendering, at 1440 / 768 / 375. Drives next dev (force-dynamic routes).
// Kept out of the default suite and CI via the testIgnore in playwright.config.ts.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['event-render-proxy.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    navigationTimeout: 60_000,
  },
  projects: [
    { name: '1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: '375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
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
