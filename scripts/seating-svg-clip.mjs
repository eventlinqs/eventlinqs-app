/**
 * Tight, high-DPI clip of the buyer seat-map SVG only, with two seats selected,
 * for close visual judgement of seat states.
 * Usage: node scripts/seating-svg-clip.mjs <baseUrl> <slug> <outFile>
 */
import { chromium } from 'playwright'

const [BASE, SLUG, OUT] = process.argv.slice(2)
if (!BASE || !SLUG || !OUT) throw new Error('usage: node scripts/seating-svg-clip.mjs <baseUrl> <slug> <outFile>')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'load', timeout: 120000 })
await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })
const clickable = page.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
const n = await clickable.count()
for (let i = 0; i < Math.min(2, n); i++) await clickable.nth(i).click({ force: true })
await page.waitForTimeout(600)
await page.locator('svg[aria-label="Seat map"]').screenshot({ path: OUT })
console.log('[svg-clip]', OUT)
await browser.close()
