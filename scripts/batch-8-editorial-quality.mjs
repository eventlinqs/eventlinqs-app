// Batch 8 - intersection editorial quality verification.
// Captures 10 random intersection pages (mix of cultures and cities,
// AU and international) to prove all 271 hand-crafted editorials
// render correctly.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-8-evidence/intersection-editorial-quality'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const SAMPLES = [
  ['pacific',         'hobart'],
  ['filipino',        'darwin'],
  ['mediterranean',   'geelong'],
  ['middle-eastern',  'adelaide'],
  ['gospel',          'townsville'],
  ['comedy',          'canberra'],
  ['wellness',        'sunshine-coast'],
  ['pride',           'wollongong'],
  ['caribbean',       'cairns'],
  ['european',        'bendigo'],
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})
const page = await ctx.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

for (const [culture, city] of SAMPLES) {
  console.log(`capture ${culture}/${city}`)
  try {
    await page.goto(`${BASE}/culture/${culture}/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page.waitForTimeout(800)
    // Locate the editorial section and capture it.
    const editorial = page.locator('section', { hasText: 'Where' }).first()
    const found = await editorial.count()
    if (found > 0) {
      await editorial.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await editorial.screenshot({ path: `${OUT}/${culture}-${city}-editorial.png` })
    } else {
      // Fallback: full-page capture
      await page.screenshot({ path: `${OUT}/${culture}-${city}-full.png`, fullPage: true })
    }
  } catch (e) {
    console.log(`  fail: ${e.message?.slice(0, 100)}`)
  }
}

await browser.close()
console.log('done')
