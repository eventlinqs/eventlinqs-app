import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/legacy-purge/after'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const el = page.locator('section[aria-label="Browse by category"]').first()
try { await el.screenshot({ path: `${OUT}/category-nav.png` }); console.log('ok category-nav') }
catch(e){ console.log('FAIL', e.message) }
// top region (hero + new category nav)
await page.setViewportSize({ width: 1440, height: 1300 })
await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/top-1440.png` })
console.log('ok top')
await b.close()
