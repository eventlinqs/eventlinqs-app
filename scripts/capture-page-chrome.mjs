// Generic full-page capture rig for buyer-surface benchmarks.
// Captures one path at 1440 / 768 / 390, full page.
// Usage:
//   PAGE_PATH=/events SLUG=events OUT_DIR=qa/x node scripts/capture-page-chrome.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const PATH = process.env.PAGE_PATH ?? '/'
const SLUG = process.env.SLUG ?? 'page'
const OUT = process.env.OUT_DIR ?? 'qa/pages'
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
    await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    // Nudge lazy content into view, then return to top for a clean full-page shot.
    await page.evaluate(async () => {
      await new Promise(res => {
        let y = 0
        const step = () => {
          window.scrollTo(0, y)
          y += window.innerHeight
          if (y < document.body.scrollHeight) setTimeout(step, 100)
          else { window.scrollTo(0, 0); setTimeout(res, 300) }
        }
        step()
      })
    })
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, `${SLUG}-${vp.name}.png`), fullPage: true })
    await ctx.close()
    console.log(`captured ${SLUG} ${vp.name}`)
  }
} finally {
  await browser.close()
}
