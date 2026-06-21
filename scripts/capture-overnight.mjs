// Overnight per-page capture pass. Full-page screenshots at 1440 + 390 with a
// REAL Chrome UA (so the section treatment, reveals, and hover-wash motion
// engine render exactly as a real visitor sees them). Evidence for the morning
// report's per-page SURPASS/PARITY/BELOW verdicts.
//
// Usage: node scripts/capture-overnight.mjs [BASE]
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = (
  process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app'
).replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/overnight-elevation/pages'
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

await mkdir(OUT, { recursive: true })

const PAGES = [
  ['home', '/'],
  ['events', '/events'],
  ['organisers', '/organisers'],
  ['pricing', '/pricing'],
  ['help', '/help'],
  ['about', '/about'],
  ['careers', '/careers'],
  ['press', '/press'],
  ['legal-terms', '/legal/terms'],
  ['city-sydney', '/city/sydney'],
  ['suburb-inner-west', '/city/sydney/inner-west'],
  ['community-african', '/community/african'],
  ['login', '/login'],
]

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }],
]

const browser = await chromium.launch({ headless: true })
for (const [name, path] of PAGES) {
  for (const [vpName, vp] of viewports) {
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: vpName === '390' ? 3 : 2,
      userAgent: REAL_UA,
    })
    const page = await ctx.newPage()
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60_000 })
      // Trigger lazy media + scroll reveals, then settle back to top.
      await page.evaluate(async () => {
        await new Promise((res) => {
          let y = 0
          const step = () => {
            window.scrollTo(0, y)
            y += window.innerHeight
            if (y < document.body.scrollHeight) setTimeout(step, 120)
            else { window.scrollTo(0, 0); setTimeout(res, 400) }
          }
          step()
        })
      })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: true })
      console.log(`OK ${name} ${vpName}`)
    } catch (e) {
      console.log(`ERR ${name} ${vpName}: ${e.message?.slice(0, 80)}`)
    }
    await ctx.close()
  }
}
await browser.close()
console.log('done')
