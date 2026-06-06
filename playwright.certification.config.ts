import { defineConfig, devices } from '@playwright/test'

/**
 * Launch-certification E2E suite.
 *
 * Runs the full buyer journey and the failure drills against a REAL, fully
 * wired deployment (staging by default), NOT a local dev server. There is no
 * webServer here: it drives an external target at CERT_BASE_URL, where Stripe
 * test mode, the Stripe webhook, Supabase, and Redis are all live.
 *
 * Required env: CERT_BASE_URL. Per-scenario env (event slugs, expired
 * reservation id, buyer creds) is documented in
 * docs/launch-hardening/certification.md. When CERT_BASE_URL is absent the
 * suite skips cleanly, so this config is safe to leave in the repo.
 *
 *   CERT_BASE_URL=https://staging.eventlinqs.com \
 *   CERT_PAID_EVENT_SLUG=... CERT_FREE_EVENT_SLUG=... \
 *   npx playwright test --config playwright.certification.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['certification.spec.ts'],
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'qa/certification-report' }]],
  // The journey waits on a Stripe webhook to confirm the order, so give it room.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.CERT_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
