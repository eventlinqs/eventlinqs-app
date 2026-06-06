// One-off capture rig for the [SHARED] header + footer surface.
// Captures three proofs per viewport on the homepage:
//   1. header State A (top of a hero route, transparent navy gradient)
//   2. header State B (scrolled past the sentinel, solid navy + gold edge)
//   3. footer (full footer in view)
// Usage: OUT_DIR=docs/benchmark/system-pass/surface-1/before node scripts/capture-shared-chrome.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = process.env.OUT_DIR ?? 'qa/shared'
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(1200)

    // State A: header at the very top of a hero route.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `home-headerA-${vp.name}.png`) })

    // State B: scrolled past the 80px sentinel -> solid navy header.
    await page.evaluate(() => window.scrollTo(0, 700))
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, `home-headerB-${vp.name}.png`) })

    // Footer: scroll to the very bottom, then frame the footer.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(900)
    const footer = page.locator('footer[aria-label="Site footer"]')
    await footer.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await footer.screenshot({ path: join(OUT, `footer-${vp.name}.png`) })

    await ctx.close()
    console.log(`captured ${vp.name}`)
  }
} finally {
  await browser.close()
}
