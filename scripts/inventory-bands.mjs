import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/legacy-purge/before/bands'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(1000)
const total = await page.evaluate(() => document.body.scrollHeight)
let y = 0, i = 0
while (y < total) {
  await page.evaluate(yy => window.scrollTo(0, yy), y)
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/band-${String(i).padStart(2,'0')}.png` })
  y += 820; i++
}
console.log(`captured ${i} bands, page height ${total}`)
await b.close()
