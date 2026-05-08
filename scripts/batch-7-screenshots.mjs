// Batch 7 - intersection page screenshot capture (top 10 x 1440 + 375 = 20).
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.ELINQS_BASE ?? 'http://localhost:3002'
const OUT = 'docs/redesign/batch-7-evidence/intersections'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const TOP_10 = [
  ['african',        'sydney'],
  ['african',        'melbourne'],
  ['south-asian',    'sydney'],
  ['south-asian',    'melbourne'],
  ['caribbean',      'sydney'],
  ['east-asian',     'sydney'],
  ['latin',          'sydney'],
  ['mediterranean',  'melbourne'],
  ['middle-eastern', 'sydney'],
  ['filipino',       'melbourne'],
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375',  width: 375,  height: 812 },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (compatible; EventLinqsScreenshot/1.0)',
})

async function primeLazy(page) {
  await page.evaluate(async () => {
    const total = document.body.scrollHeight
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 130))
    }
    window.scrollTo(0, total)
    await new Promise(r => setTimeout(r, 400))
    window.scrollTo(0, 0)
    await new Promise(r => setTimeout(r, 300))
  })
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

for (const vp of VIEWPORTS) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: vp.width, height: vp.height })
  for (const [culture, city] of TOP_10) {
    const url = `${BASE}/culture/${culture}/${city}`
    console.log(`[${vp.name}] ${culture}/${city}`)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
      await primeLazy(page)
      await page.screenshot({
        path: `${OUT}/${culture}-${city}-${vp.name}.png`,
        fullPage: true,
      })
    } catch (e) {
      console.log(`  (non-fatal: ${e.message?.slice(0, 160)})`)
    }
  }
  await page.close()
}

await ctx.close()
await browser.close()
console.log('done')
