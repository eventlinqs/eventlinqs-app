/** Phase C drive 4: the four missing 390 captures (orphan nudge, server
 *  best-available, builder curve, builder underlay). */
import { chromium } from 'playwright'

const BASE =
  'https://eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/design/phase-c-2026-07-25'
const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'
const COVER = 'public/images/hero/comedy.jpg'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await Promise.all([
  page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])
log('login ok at 390')

// Orphan nudge + server best-available on the 50-seat event.
await page.goto(`${BASE}/events/seat-proof-fifty-nwltxi`, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2500)
const map = page.locator('div.relative:has(> div > svg[aria-label="Seat map"])').first()
await map.scrollIntoViewIfNeeded()
await page.waitForTimeout(1200)
await page.locator('[aria-label^="A seat 2,"]').click()
await page.waitForTimeout(1000)
await page.getByText(/stranded/i).scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/buyer-orphan-nudge-390.png`, fullPage: false })
log('nudge 390')
await page.getByRole('button', { name: /sit us together/i }).click()
await page.waitForTimeout(2500)
await map.scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
await map.screenshot({ path: `${OUT}/buyer-best-available-390.png` })
log('best available 390')

// Builder: curve slider + underlay at 390 on the curved chart.
await page.goto(`${BASE}/dashboard/venues`, { waitUntil: 'load', timeout: 90000 })
await page.locator('a[href*="seat-maps"]').first().click()
await page.waitForURL(/seat-maps/, { timeout: 30000 })
await page.waitForTimeout(1200)
const chartRow = page.locator('div:has(> div > p:text-is("Proof 500 Curved"))').last()
await chartRow.getByRole('button', { name: /edit chart/i }).click()
await page.waitForTimeout(2500)
await page.locator('input[type="range"][aria-label*="Row curve"]').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/builder-curve-slider-390.png`, fullPage: false })
log('curve slider 390')
await page.locator('input[type="file"][aria-label*="floor plan"]').setInputFiles(COVER)
await page.waitForTimeout(1500)
await page.locator('svg[aria-label="Seating chart canvas"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/builder-underlay-390.png`, fullPage: false })
log('underlay 390')

await browser.close()
log('DONE')
