import { existsSync } from 'node:fs'
import { test, expect } from './lib/journey'

/**
 * E. ADMIN. The sign in page answers and asks for the six digit code (2FA is mandatory). Every admin page, with a signed in
 * session, answers and is in hand within one second at 390 (law 41): that half needs a staff session saved by a person
 * with the code (tests/admin-proof/auth.setup.ts writes .auth/admin.json); without it the half is NOT JUDGED and says so,
 * never passed.
 */
const STATE = process.env.JOURNEY_ADMIN_STATE ?? '.auth/admin.json'
const hasSession = existsSync(STATE)

// Every admin page with an index, read from src/app/admin/(authed) on 21 November 2026 (enrol-2fa left out: it is the
// enrolment step, not a page of work).
const ADMIN_PAGES = [
  '/admin', '/admin/acquisition', '/admin/analytics', '/admin/attribution', '/admin/audience', '/admin/audit',
  '/admin/automation', '/admin/campaigns', '/admin/collected', '/admin/comms', '/admin/disputes',
  '/admin/eligibility', '/admin/engine', '/admin/events', '/admin/flags', '/admin/growth', '/admin/health',
  '/admin/kyc', '/admin/marketplace', '/admin/matches', '/admin/network', '/admin/notifications',
  '/admin/opportunity', '/admin/orders', '/admin/organisers', '/admin/page-checks', '/admin/partners',
  '/admin/payouts', '/admin/pricing', '/admin/promotions', '/admin/refunds', '/admin/roundup', '/admin/search',
  '/admin/social', '/admin/staff', '/admin/submissions', '/admin/today', '/admin/traffic', '/admin/users',
  '/admin/venues',
]

test.describe('E admin', () => {
  test('the admin sign in asks for email, password and the code @sweep @monitor', async ({ journey, page }) => {
    await journey.step('open /admin/login', async () => {
      const t0 = Date.now()
      await journey.open('/admin/login')
      await expect(page.locator('#email')).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.locator('#totp')).toBeVisible()
      const ms = Date.now() - t0
      expect(ms, `the admin sign in took ${ms} ms to be usable`).toBeLessThan(3_000)
    })
    await journey.step('a signed out visit to an admin page is sent to sign in', async () => {
      await page.goto('/admin/health')
      await expect(page).toHaveURL(/\/admin\/login/)
    })
  })

  test.describe('signed in', () => {
    test.skip(!hasSession, `NOT JUDGED: no staff session at ${STATE} (a person with the code saves one)`)
    test.use({ storageState: hasSession ? STATE : undefined })
    for (const p of ADMIN_PAGES) {
      test(`${p} answers within one second @sweep`, async ({ journey, page }) => {
        await journey.step(`open ${p}`, async () => {
          const res = await page.goto(p, { waitUntil: 'domcontentloaded' })
          expect(res?.status() ?? 0, `${p} answered ${res?.status()}`).toBeLessThan(400)
          await expect(page).not.toHaveURL(/\/admin\/login/)
          const nav = await page.evaluate(() => {
            const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
            return n ? Math.round(n.responseEnd) : -1
          })
          expect(nav, `${p} took ${nav} ms to arrive (law 41: one second)`).toBeLessThan(1_000)
          await expect(page.locator('h1').first()).toBeVisible()
        })
      })
    }
  })
})
