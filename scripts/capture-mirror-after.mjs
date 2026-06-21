// Post-change captures for the competitor-mirror pass: the flattened heroes and
// the two rebuilt surfaces (pricing tinted band, desktop auth brand panel), at
// 1440 + 390 with a real UA. Output -> docs/benchmark/system-pass/competitor-mirror/after/
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const OUT = 'docs/benchmark/system-pass/competitor-mirror/after'
const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const PAGES = [
  ['pricing', '/pricing'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['event-detail', '/events/aso-ebi-affair-owambe-garden-party'],
  ['city-sydney', '/city/sydney'],
  ['community-african', '/community/african'],
]
const VPS = [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]
await mkdir(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--no-sandbox'] })
for (const [name, path] of PAGES) {
  for (const [vn, vp] of VPS) {
    try {
      const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vn === '390' ? 3 : 2, userAgent: REAL_UA })
      const page = await ctx.newPage()
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(900)
      // full-page for pricing (show tier band + rhythm); fold for the rest
      const fullPage = name === 'pricing'
      await page.screenshot({ path: `${OUT}/${name}-${vn}.png`, fullPage, ...(fullPage ? {} : { clip: { x: 0, y: 0, width: vp.width, height: vp.height } }) })
      console.log(`OK ${name} ${vn}`)
      await ctx.close()
    } catch (e) { console.log(`ERR ${name} ${vn}: ${e.message.slice(0, 60)}`) }
  }
}
await b.close()
console.log('done')
