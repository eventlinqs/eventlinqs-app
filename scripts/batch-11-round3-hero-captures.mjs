// Capture all 5 founder-locked hero slides at desktop 1440 + mobile 390
// after the Round 3 migration applied.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/screenshots/round3-hero-slots'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390',  { width: 390, height: 844 }],
]

const browser = await chromium.launch({ headless: true })
for (const [name, vp] of viewports) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(1200)
  // Capture each of the 5 slides by clicking dots
  for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
    const selector = `button[role="tab"][aria-label^="Slide ${slotIdx + 1}:"]`
    try {
      await page.click(selector)
      await page.waitForTimeout(900)
    } catch {
      console.log(`(could not click slot ${slotIdx + 1} at ${name})`)
    }
    await page.screenshot({
      path: `${OUT}/slot-${slotIdx + 1}-${name}.png`,
      clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) },
    })
    console.log(`OK slot ${slotIdx + 1} ${name}`)
  }
  await ctx.close()
}
await browser.close()
