import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/system-pass/surface-0'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1.5 })
const page = await ctx.newPage()
await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)
// top: hero + Browse by Category + This Week
await page.screenshot({ path: `${OUT}/after-top-1440.png` })
// scroll to the Music/Food rails to check uniform cards + dividers
await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/after-mid-1440.png` })
console.log('done')
await b.close()
