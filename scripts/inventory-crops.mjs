import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
const OUT = 'docs/benchmark/legacy-purge/before/elements'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ headless: true })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:3210/', { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(1000)
const shots = [
  ['chip-strip', 'section[aria-label="Quick filters"]'],
  ['city-rail', 'section[aria-labelledby="cities-heading"]'],
  ['featured-venues', 'section[aria-label="Featured venues"]'],
]
for (const [name, sel] of shots) {
  const el = page.locator(sel).first()
  try { await el.screenshot({ path: `${OUT}/${name}.png` }); console.log(`ok ${name}`) }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`) }
}
await b.close()
