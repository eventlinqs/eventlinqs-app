import { defineConfig, devices } from '@playwright/test'

/**
 * THE PRODUCTION JOURNEYS (WINDOW 5C, 21 November 2026; Lawal, 09:02: "Every link works. Every function works to
 * completion"). Every journey a person takes on the live site, driven as that person would, phone first: 390, then 320,
 * then 1440. Each step is timed and photographed, and the run writes summary.json and summary.md with PASS or FAIL per
 * journey and the exact failing line (tests/e2e/production-journeys/lib/journey-reporter.ts).
 *
 *   npx playwright test --config playwright.journeys.config.ts                       the whole sweep, every width
 *   npx playwright test --config playwright.journeys.config.ts --project phone-390   one width
 *   npx playwright test --config playwright.journeys.config.ts --grep @monitor       the 15 minute monitor's set
 *
 * JOURNEY_BASE   the site under test (default the canonical production host; a preview URL for a pull request)
 * JOURNEY_OUT    where the steps' screenshots and the summary go (default test-results/journeys/<stamp>)
 *
 * No webServer: this never starts a server. It drives the site that people use.
 */
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
process.env.JOURNEY_OUT ??= `test-results/journeys/${stamp}`

const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 EventLinqs-QA-journey/1.0'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 EventLinqs-QA-journey/1.0'

export default defineConfig({
  testDir: './tests/e2e/production-journeys',
  testMatch: /.*\.journey\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: Number(process.env.JOURNEY_RETRIES ?? 0),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: `${process.env.JOURNEY_OUT}/artifacts`,
  reporter: [['list'], ['./tests/e2e/production-journeys/lib/journey-reporter.ts']],
  use: {
    baseURL: process.env.JOURNEY_BASE ?? 'https://www.eventlinqs.com.au',
    trace: 'retain-on-failure',
    screenshot: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
  },
  projects: [
    {
      name: 'phone-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        userAgent: PHONE_UA,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'phone-320',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 640 },
        userAgent: PHONE_UA,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA },
    },
  ],
})
