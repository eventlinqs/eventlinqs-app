import { defineConfig, devices } from '@playwright/test'

// Image-robustness P0: homepage and the recovered event page render with no
// 500 at 1440/768/375, axe clean. Drives next dev. Excluded from the default
// suite and CI via testIgnore in playwright.config.ts.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['homepage-image-robustness.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    navigationTimeout: 90_000,
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
