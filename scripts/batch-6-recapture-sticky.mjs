// One-shot re-capture of the mobile sticky CTA after the z-index fix.
import { chromium } from 'playwright'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-6-evidence/mobile-sticky-cta.png'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})
const page = await ctx.newPage()
await page.setViewportSize({ width: 375, height: 812 })
await page.goto(`${BASE}/city/sydney`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
await page.evaluate(() => window.scrollTo(0, 700))
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT, fullPage: false })
await browser.close()
console.log('done')
