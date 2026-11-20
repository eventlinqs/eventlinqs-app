import { test, expect } from './lib/journey'

/**
 * D. EVERYWHERE: the pages a visitor lands on, each answering, painted and free of script errors and failed requests;
 * the designed 404 and 410. Every header and footer link and every card and tile are judged by the link crawler and the
 * affordance scan (scripts/link-integrity-crawl.mjs, scripts/affordance-scan.mjs), run beside this suite.
 */

const PAGES: { path: string; heading?: RegExp }[] = [
  { path: '/' },
  { path: '/events' },
  { path: '/city/melbourne' },
  { path: '/city/geelong' },
  { path: '/city/ballarat' },
  { path: '/city/bendigo' },
  { path: '/state/victoria' },
  { path: '/this-weekend' },
  { path: '/cities' },
  { path: '/communities' },
  { path: '/organisers' },
  { path: '/submit-event' },
  { path: '/pricing' },
  { path: '/about' },
  { path: '/contact' },
  { path: '/help' },
  { path: '/login' },
  { path: '/signup' },
  { path: '/legal/terms' },
  { path: '/legal/privacy' },
  { path: '/legal/refunds' },
]

test.describe('D everywhere', () => {
  for (const p of PAGES) {
    test(`page ${p.path} answers, paints and has no fault @sweep`, async ({ journey, page }) => {
      await journey.step(`open ${p.path}`, async () => {
        const mark = journey.mark()
        await journey.open(p.path)
        await expect(page.locator('h1').first(), `${p.path} has no heading`).toBeVisible()
        await page.waitForLoadState('load')
        // The page settles: late requests (images, the map, measurement) have their chance to fail.
        await page.waitForTimeout(1500)
        journey.expectClean(mark, `${p.path} faults`)
      })
      await journey.step('no sideways scroll at this width', async () => {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(over, `${p.path} is ${over}px wider than the screen`).toBeLessThanOrEqual(1)
      })
    })
  }

  test('a page that does not exist is the designed 404 @sweep @monitor', async ({ journey, page }) => {
    await journey.step('open a missing address', async () => {
      const res = await journey.open('/this-page-does-not-exist-qa', { allow: [404] })
      expect(res.status()).toBe(404)
      await expect(page.getByText("We can't find that page")).toBeVisible()
    })
    await journey.step('the way back home works', async () => {
      const home = page.locator('main a[href="/"]').first()
      await expect(home).toBeVisible()
      await home.click()
      await expect(page).toHaveURL(/\/$/)
    })
  })

  test('a deleted event answers the designed 410 @sweep', async ({ journey, page }) => {
    await journey.step('open a deleted event', async () => {
      // A slug read from production's event_tombstones at 09:17 on 21 November 2026 (qa-5c\reads\q-fixtures.sql).
      const res = await journey.open('/events/wwe-rod-laver-arena-2026-12-10', { allow: [410] })
      expect(res.status()).toBe(410)
      await expect(page.locator('h1')).toHaveText('This event has been removed')
    })
    await journey.step('Browse what is on leads to the events', async () => {
      await page.getByRole('link', { name: 'Browse what is on' }).click()
      await expect(page).toHaveURL(/\/events$/)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  })
})
