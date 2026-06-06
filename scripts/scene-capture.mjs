import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'docs/benchmark/system-pass/phase-b/scenes-v2'
mkdirSync(OUT, { recursive: true })
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const browser = await chromium.launch()
for (const v of [{ name: '1440', width: 1440, height: 900 }, { name: '390', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, userAgent: REAL_UA })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 })
  const heading = page.getByText('Scenes and sounds', { exact: false }).first()
  await heading.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/scene-rail-${v.name}.png` })
  await ctx.close()
}
await browser.close()
console.log('scene captures written to', OUT)
