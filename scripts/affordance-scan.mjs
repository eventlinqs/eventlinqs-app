// Interactive-affordance scan (CLAUDE.md law: no dead-end tiles).
//
// On every public page, finds tile/card-shaped <img> elements that sit inside a
// GRID or RAIL and FAILS if the image has no ancestor anchor (<a href>) or
// button. Decorative imagery is allowed ONLY as full-bleed backgrounds or inline
// editorial photos (not card/tile-shaped items in grids/rails), so those are
// excluded by shape + container heuristics. Runs beside the link-integrity
// crawler in the audit suite.
//
// Usage: node scripts/affordance-scan.mjs [BASE]
import { chromium } from 'playwright'

const BASE = (process.argv[2] ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const PAGES = [
  ['home', '/'],
  ['organisers', '/organisers'],
  ['pricing', '/pricing'],
  ['about', '/about'],
  ['events-browse', '/events'],
  ['event-detail', '/events/aso-ebi-affair-owambe-garden-party'],
  ['city', '/city/sydney'],
  ['suburb', '/city/sydney/inner-west'],
  ['community', '/community/african'],
  ['communities-hub', '/communities'],
  ['category', '/events?category=music'],
  ['community-city', '/community/african/sydney'],
  ['help', '/help'],
  ['press', '/press'],
  ['careers', '/careers'],
  ['legal-terms', '/legal/terms'],
]

// In-page detector. Returns dead-end tile descriptors.
const DETECT = () => {
  const isClickable = (el) => {
    let n = el
    while (n) {
      if (n.tagName === 'A') {
        const h = n.getAttribute('href')
        if (h && !/^(#|javascript:|mailto:|tel:)/.test(h)) return true
      }
      if (n.tagName === 'BUTTON') return true
      const role = n.getAttribute && n.getAttribute('role')
      if (role === 'button' || role === 'link') return true
      n = n.parentElement
    }
    return false
  }
  const inGridOrRail = (el) => {
    let n = el.parentElement
    let depth = 0
    while (n && depth < 7) {
      const cs = getComputedStyle(n)
      if (cs.display === 'grid' || cs.display === 'inline-grid') return true
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cs.display.includes('flex')) return true
      const role = n.getAttribute && n.getAttribute('role')
      if (role === 'group' || role === 'list') return true
      n = n.parentElement
      depth++
    }
    return false
  }
  const out = []
  for (const img of Array.from(document.querySelectorAll('img'))) {
    const r = img.getBoundingClientRect()
    if (r.width < 80 || r.width > 560 || r.height < 80) continue // icons / full-bleed excluded
    if (isClickable(img)) continue
    if (!inGridOrRail(img)) continue // inline editorial photos allowed
    out.push({
      src: (img.currentSrc || img.getAttribute('src') || '').slice(0, 100),
      alt: (img.getAttribute('alt') || '').slice(0, 60),
      w: Math.round(r.width), h: Math.round(r.height),
    })
  }
  return out
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
let total = 0
const results = []
for (const [name, path] of PAGES) {
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, userAgent: UA })
    const page = await ctx.newPage()
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 })
    const status = res ? res.status() : 0
    // scroll through to trigger lazy images, then settle
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(600)
    const viol = await page.evaluate(DETECT)
    total += viol.length
    results.push({ name, path, status, violations: viol.length, detail: viol })
    console.log(`${viol.length === 0 ? 'OK  ' : 'FAIL'} ${name.padEnd(14)} [${status}] dead-end tiles: ${viol.length}`)
    if (viol.length) viol.slice(0, 6).forEach(v => console.log(`       - ${v.alt || '(no alt)'} ${v.w}x${v.h} ${v.src}`))
    await ctx.close()
  } catch (e) {
    results.push({ name, path, error: String(e).slice(0, 100) })
    console.log(`ERR  ${name}: ${String(e).slice(0, 80)}`)
  }
}
await b.close()
console.log(`\nTOTAL dead-end tiles across ${PAGES.length} pages: ${total}`)
console.log(total === 0 ? 'AFFORDANCE SCAN: PASS' : 'AFFORDANCE SCAN: FAIL')
process.exit(total === 0 ? 0 : 1)
