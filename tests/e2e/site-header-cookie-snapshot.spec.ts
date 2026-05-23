import { test, expect } from '@playwright/test'

/**
 * Regression: React #185 (Maximum update depth exceeded) in the
 * SiteHeader cookie snapshot path.
 *
 * Incident 2026-05-24: src/components/layout/site-header-client.tsx
 * passed `readCityCookie` to `useSyncExternalStore` as `getSnapshot`.
 * The implementation returned a fresh object literal on every call
 * when the el_city cookie was set, violating the hook's
 * referential-stability contract. React's per-render Object.is check
 * then saw "store changed" forever, rescheduling renders until the
 * safety limit fired #185 and the error boundary rendered
 * "We hit a snag loading this page". The trigger required a
 * SECOND render after mount (HeroPresenceProvider update from
 * HeroMedia registration, scroll sentinel flip, mobile menu toggle,
 * etc), which is why the bug latent for 3 weeks and surfaced once
 * the M5 hero carousel reliably produced post-mount second renders.
 *
 * What this spec guards against:
 *   - The bug is CONFIRMED viewport-agnostic and cookie-driven. The
 *     founder's "mobile only" report was incidental to their session
 *     state. We run all four cells of the {viewport} × {cookie}
 *     matrix and assert each is clean.
 *   - Any future change that returns a new object literal from a
 *     useSyncExternalStore getSnapshot (or anything else that triggers
 *     #185 on the homepage) will fail here before hitting production.
 *
 * Surface tested: HTTP path "/" only. The bug lives in the global
 * SiteHeader so the homepage is sufficient.
 *
 * Companion unit test: tests/unit/site-header-cookie-snapshot.test.ts
 * pins the same contract at the function level. Both are required: the
 * unit test catches the snapshot-stability invariant deterministically,
 * the E2E catches the integrated React behaviour in a real browser.
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

test.describe('SiteHeader cookie snapshot - React #185 regression', () => {
  // Each test installs its own console + pageerror listeners. React
  // surfaces #185 via both channels depending on whether it bubbles
  // through the error boundary or not - we watch both.
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
    // Allow the second-render window to close. The loop would surface
    // within 1-2 seconds of hydration if the bug were present.
    await page.waitForTimeout(2000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText, 'error boundary text must not appear').not.toContain(
      ERROR_BOUNDARY_TEXT,
    )
    const reactLoopErrors = [...consoleErrors, ...pageErrors].filter(s =>
      REACT_LOOP_RE.test(s),
    )
    expect(reactLoopErrors, 'no React update-depth / minified-error matches').toEqual([])
    // Cheap content sanity: we did not render an empty body.
    expect(bodyText.length).toBeGreaterThan(200)
  }

  test('homepage renders cleanly with no el_city cookie', async ({ page }) => {
    await assertHomepageRenders(page)
  })

  test('homepage renders cleanly with el_city cookie set (the #185 trigger)', async ({
    page,
    context,
    baseURL,
  }) => {
    expect(baseURL, 'playwright baseURL must be configured').toBeTruthy()
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
