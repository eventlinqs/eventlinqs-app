// Batch 11 - Verify header initial-state fix on /community/african,
// /city/sydney, /community/african/sydney at 3 viewports each.
//
// Two captures per (page, viewport): the top of the page (where the
// header sits on the hero) and a scrolled position where State B
// kicks in. Lets the founder confirm white nav is readable in both
// states.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/screenshots/after/header-fix'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const routes = [
  ['community-african',         '/community/african'],
  ['city-sydney',             '/city/sydney'],
  ['community-african-sydney',  '/community/african/sydney'],
]
const viewports = [
  ['390',  { width: 390,  height: 844 }],
  ['768',  { width: 768,  height: 1024 }],
  ['1440', { width: 1440, height: 900 }],
]

const browser = await chromium.launch({ headless: true })
for (const [label, path] of routes) {
  for (const [vpName, vp] of viewports) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const url = BASE + path
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(700)
      await page.screenshot({
        path: `${OUT}/${label}-${vpName}-top.png`,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 240) },
      })
      // Scroll to trigger State B
      await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
      await page.waitForTimeout(500)
      await page.screenshot({
        path: `${OUT}/${label}-${vpName}-scrolled.png`,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 200) },
      })
      console.log(`  OK  ${label} ${vpName}`)
    } catch (e) {
      console.log(`  ERR ${label} ${vpName}: ${e.message?.slice(0, 80)}`)
    }
    await context.close()
  }
}
await browser.close()
console.log('Done.')
