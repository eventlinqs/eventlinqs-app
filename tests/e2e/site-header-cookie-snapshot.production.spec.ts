import { test, expect } from '@playwright/test'

/**
 * Production smoke companion to site-header-cookie-snapshot.spec.ts.
 *
 * Runs against the live production URL configured in
 * playwright.smoke.config.ts (default https://www.eventlinqs.com) and
 * asserts the same React #185 regression invariants the local spec
 * holds. Tagged @smoke so the post-deploy workflow can filter to just
 * these tests via --grep @smoke.
 *
 * What the @smoke tag means in this repo:
 *   - Fast, low-flake, headless
 *   - Targets live production
 *   - Safe to run on every deploy (no destructive actions, no auth
 *     state, no DB writes)
 */

const ERROR_BOUNDARY_TEXT = 'We hit a snag loading this page'
const REACT_LOOP_RE = /Minified React error #(\d+)|Maximum update depth/
const MELBOURNE_COOKIE_VALUE = encodeURIComponent(
  JSON.stringify({
    city: 'Melbourne',
    region: 'Victoria',
    country: 'AU',
    source: 'picker',
  }),
)

test.describe('@smoke SiteHeader cookie snapshot - production', () => {
  let consoleErrors: string[]
  let pageErrors: string[]

  test.beforeEach(async ({ page }) => {
    consoleErrors = []
    pageErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', err => pageErrors.push(err.message))
  })

  async function assertHomepageRenders(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/', { waitUntil: 'networkidle' })
    // Allow the second-render window to close. Slightly longer than
    // local because production round-trip is higher latency.
    await page.waitForTimeout(3000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText, 'error boundary text must not appear').not.toContain(
      ERROR_BOUNDARY_TEXT,
    )
    const reactLoopErrors = [...consoleErrors, ...pageErrors].filter(s =>
      REACT_LOOP_RE.test(s),
    )
    expect(reactLoopErrors, 'no React update-depth / minified-error matches').toEqual([])
    expect(bodyText.length).toBeGreaterThan(200)
  }

  test('@smoke homepage renders cleanly with no el_city cookie', async ({ page }) => {
    await assertHomepageRenders(page)
  })

  test('@smoke homepage renders cleanly with el_city cookie set', async ({
    page,
    context,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy()
    await context.addCookies([
      {
        name: 'el_city',
        value: MELBOURNE_COOKIE_VALUE,
        url: baseURL!,
      },
    ])
    await assertHomepageRenders(page)
  })
})
