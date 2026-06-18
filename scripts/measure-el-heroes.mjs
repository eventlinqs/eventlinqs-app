// Measure EventLinqs hero heights on the deployed preview (real UA) to verify
// the single-standard hero law: every page hero should equal the homepage
// scale (~432px desktop @900vh, ~354px mobile @844vh; capped 480 / floor 320).
// Usage: node scripts/measure-el-heroes.mjs [BASE]
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const VPS = [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]

// page -> selector for the hero band. Homepage hero uses inline h-[42vh]; the
// rest now carry .hero-marketing. Event detail also exposes the aria label.
const PAGES = [
  ['home', '/', 'main > *:first-child, [class*="h-[42vh]"]'],
  ['event-detail', '/events/aso-ebi-affair-owambe-garden-party', 'section[aria-label="Event hero"]'],
  ['city', '/city/sydney', '.hero-marketing'],
  ['suburb', '/city/sydney/inner-west', '.hero-marketing'],
  ['culture', '/culture/african', '.hero-marketing'],
  ['organisers', '/organisers', '.hero-marketing'],
]

const b = await chromium.launch({ args: ['--no-sandbox'] })
const out = {}
for (const [name, path, sel] of PAGES) {
  out[name] = {}
  for (const [vn, vp] of VPS) {
    try {
      const ctx = await b.newContext({ viewport: vp, userAgent: REAL_UA })
      const page = await ctx.newPage()
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(600)
      const h = await page.evaluate((s) => {
        const el = document.querySelector(s)
        return el ? Math.round(el.getBoundingClientRect().height) : null
      }, sel)
      out[name][vn] = h
      console.log(`${name} ${vn}: ${h}px`)
      await ctx.close()
    } catch (e) { out[name][vn] = `ERR ${e.message.slice(0, 50)}`; console.log(`${name} ${vn}: ERR`) }
  }
}
await b.close()
mkdirSync('docs/benchmark/system-pass/competitor-mirror', { recursive: true })
writeFileSync('docs/benchmark/system-pass/competitor-mirror/el-hero-heights.json', JSON.stringify(out, null, 2))

// Tolerance check: every measured hero within +-25px of homepage at each vp.
const std = out.home
let ok = true
for (const [name, m] of Object.entries(out)) {
  for (const vn of ['1440', '390']) {
    const v = m[vn], s = std[vn]
    if (typeof v === 'number' && typeof s === 'number' && Math.abs(v - s) > 25) {
      console.log(`  OUTLIER ${name} ${vn}: ${v}px vs home ${s}px`); ok = false
    }
  }
}
console.log('\n' + (ok ? 'PASS: all heroes within +-25px of the homepage standard.' : 'CHECK: outliers above (deploy may be mid-flight, or a real deviation).'))
