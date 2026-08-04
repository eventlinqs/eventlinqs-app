/**
 * Element-level clips of the buyer seat-map panel (and optional zoomed state)
 * at 1440x900 and 390x844, for close visual judgement.
 * Usage: node scripts/seating-map-clip.mjs <baseUrl> <slug> <outDir>
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const [BASE, SLUG, OUT] = process.argv.slice(2)
if (!BASE || !SLUG || !OUT) throw new Error('usage: node scripts/seating-map-clip.mjs <baseUrl> <slug> <outDir>')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
for (const [label, viewport, mobile] of [
  ['1440x900', { width: 1440, height: 900 }, false],
  ['390x844', { width: 390, height: 844 }, true],
]) {
  const ctx = await browser.newContext({
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForSelector('svg[aria-label="Seat map"]', { timeout: 30000 })

  // Select two seats for the selected state.
  const clickable = page.locator('svg[aria-label="Seat map"] g[style*="pointer"]')
  const n = await clickable.count()
  for (let i = 0; i < Math.min(2, n); i++) await clickable.nth(i).click({ force: true })
  await page.waitForTimeout(600)

  // The seating panel: the section that contains the map svg.
  const panel = page.locator('svg[aria-label="Seat map"]').locator('xpath=ancestor::section[1]')
  const target = (await panel.count()) ? panel : page.locator('svg[aria-label="Seat map"]').locator('xpath=ancestor::div[3]')
  await target.first().screenshot({ path: `${OUT}/map-panel-${label}.png` })
  console.log(`[clip] map-panel-${label}`)
  await ctx.close()
}
await browser.close()
console.log('[clip] COMPLETE')
