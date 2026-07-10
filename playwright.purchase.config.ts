import { defineConfig, devices } from '@playwright/test'

/**
 * Self-contained local purchase E2E. Runs the certification harness's FREE
 * happy path (browse -> reserve -> checkout -> register -> confirmation ->
 * issued ticket) against a LOCAL prod build wired to a LOCAL ephemeral Supabase
 * - no live keys, no live DB.
 *
 * The CI workflow purchase-e2e-local.yml provides the local Supabase (supabase
 * start) and seeds the free event. The cert spec only runs the scenarios whose
 * CERT_* env is set, so with just CERT_FREE_EVENT_SLUG the paid/drill scenarios
 * skip and the run stays fully self-contained.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /certification\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.CERT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
