/**
 * Capture homepage screenshots at three viewports.
 * Reused for BEFORE and AFTER M5 homepage refactor phases.
 *
 * Usage:
 *   node research/snapshots/capture-homepage.mjs <url> <outDir>
 *
 * Example:
 *   node research/snapshots/capture-homepage.mjs http://localhost:3000 research/snapshots/m5-homepage-before
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const url = process.argv[2]
const outDir = process.argv[3]
if (!url || !outDir) {
  console.error('Usage: node capture-homepage.mjs <url> <outDir>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'mobile',  width: 375,  height: 812 },
]

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
const UA_MOBILE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const browser = await chromium.launch({ headless: true })

try {
  for (const vp of VIEWPORTS) {
    const isMobile = vp.width <= 500
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      userAgent: isMobile ? UA_MOBILE : UA_DESKTOP,
      // The page reads document.cookie for the audit gate that disables
      // long-running animations under measurement. Without it the
      // ken-burns + marquee loops would keep mutating frames.
      extraHTTPHeaders: { Cookie: 'el-audit=1' },
    })
    const page = await ctx.newPage()
    console.log(`[${vp.name} ${vp.width}x${vp.height}] goto ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Allow lazy images and below-fold sections to render. The audit
    // cookie above kills perpetual animations so this dwell is bounded.
    await page.waitForTimeout(5000)
    // Slow-scroll to bottom to trigger IntersectionObserver-gated
    // sections, then back to top so the screenshot starts at hero.
    const totalScroll = await page.evaluate(() => document.documentElement.scrollHeight)
    let y = 0
    while (y < totalScroll) {
      y += vp.height
      await page.evaluate(targetY => window.scrollTo(0, targetY), y)
      await page.waitForTimeout(200)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(800)
    const file = path.join(outDir, `homepage-${vp.name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`  saved ${file}`)
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log('done')
