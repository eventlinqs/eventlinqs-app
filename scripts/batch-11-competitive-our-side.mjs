// Capture our homepage hero + header scroll at viewports matched to
// the Ticketmaster + DICE competitive references in
// docs/redesign/batch-11-evidence/competitive-benchmark/.
import { chromium } from 'playwright'

const BASE = 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/competitive-benchmark'

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390',  { width: 390, height: 844 }],
]

const browser = await chromium.launch({ headless: true })
for (const [name, vp] of viewports) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(1200)
  // Hero (top of homepage). Cap at the hero band height so we get
  // hero + header strip, matching the Ticketmaster / DICE captures.
  await page.screenshot({
    path: `${OUT}/eventlinqs-${name}-hero.png`,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) },
  })
  // Scrolled header (State B with search pill).
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${OUT}/eventlinqs-${name}-header-scrolled.png`,
    clip: { x: 0, y: 0, width: vp.width, height: 120 },
  })
  console.log(`OK ${name}`)
  await ctx.close()
}
await browser.close()
