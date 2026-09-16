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
  // event-detail is resolved from the LIVE SITEMAP below, never typed. See
  // resolveEventDetailPath: the slug that used to sit here had been deleted from
  // the catalogue, the page answered 404, and a 404 renders no tiles, so this
  // scan reported "OK ... dead-end tiles: 0" on it for as long as that was true.
  ['city', '/city/sydney'],
  ['suburb', '/city/sydney/inner-west'],
  ['community', '/community/african'],
  ['communities-hub', '/communities'],
  // THE REAL CATEGORY LANDING (close-out SEO3 step 4, 14 September 2026). This
  // entry read `/events?category=music` for as long as a category was a filter
  // rather than a page, so the scan was measuring the browse page twice and the
  // category surface never. It is a page now, with a hero, an event grid and a
  // sibling tile strip, which is exactly the shape this scan exists to judge.
  ['category', '/categories/music'],
  ['community-city', '/community/african/sydney'],
  ['help', '/help'],
  ['guides-hub', '/guides'],
  ['guide-page', '/guides/mapping-ticket-tiers-to-seats'],
  ['press', '/press'],
  ['careers', '/careers'],
  ['legal-terms', '/legal/terms'],
  // The public composer, added 9 Aug 2026. Its REVEAL state (the share-card
  // grid) cannot be reached by URL and so is scanned by
  // scripts/verify/launch-axe.mjs and the kit walk instead; this entry covers
  // the surface a stranger lands on.
  ['launch', '/launch'],
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

/**
 * A REAL EVENT PAGE, READ OUT OF THE LIVE SITEMAP.
 *
 * This entry used to be a typed slug. On 14 September 2026 that event had been
 * deleted from the catalogue, so the page answered 404 and this scan printed
 *
 *     OK   event-detail   [404] dead-end tiles: 0
 *
 * which is true and worthless: a 404 renders no tiles, so it cannot fail a scan
 * that counts tiles. The event page carries the cover image, the organiser
 * avatar and the related-events rail, and none of them had been scanned since
 * that slug went stale.
 *
 * The sitemap is the platform's own list of event URLs, so asking it is the one
 * way this cannot go stale again. If it names no event, the page is NOT scanned
 * and the run says so, rather than quietly scanning eighteen pages and calling
 * it nineteen.
 */
async function resolveEventDetailPath() {
  try {
    const res = await fetch(`${BASE}/sitemap.xml`)
    if (!res.ok) return null
    const xml = await res.text()
    /*
     * `[^<\/]+` AND NOT `[^<]+`, because the first draft of this matched
     * `/events/browse/geelong`, which is the browse-by-city page and not an
     * event at all. An event URL is `/events/<slug>` with nothing after the
     * slug, so the character class excludes the slash that would let a deeper
     * path through.
     */
    const m = /<loc>[^<]*?(\/events\/[^<\/]+)<\/loc>/.exec(xml)
    return m ? m[1] : null
  } catch (error) {
    // NAMED AND SPOKEN, never swallowed. The caller reports that the event page
    // was not scanned, but only this frame knows WHY, and "the sitemap could not
    // be reached" and "the sitemap listed no event" need opposite responses.
    console.warn(`event-detail: could not read ${BASE}/sitemap.xml:`, error)
    return null
  }
}

const eventDetailPath = await resolveEventDetailPath()
if (eventDetailPath) {
  PAGES.splice(5, 0, ['event-detail', eventDetailPath])
  console.log(`event-detail resolved from the sitemap: ${eventDetailPath}\n`)
} else {
  console.log('event-detail: the sitemap named no event URL, so the event page is NOT scanned in this run\n')
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
let total = 0
/**
 * Pages that did not render. Counted apart from tiles because it is a different
 * fault with the opposite symptom: a page that does not render has no tiles to
 * be dead ends, so it scores a perfect zero and reads as a pass.
 */
const unreachable = []
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
    if (status !== 200) {
      unreachable.push(`${name} ${path} answered ${status}`)
      console.log(`FAIL ${name.padEnd(14)} [${status}] page did not render, so nothing on it was scanned`)
      await ctx.close()
      continue
    }
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
if (unreachable.length > 0) {
  console.log(`\n${unreachable.length} page(s) could not be scanned because they did not render:`)
  for (const u of unreachable) console.log(`  - ${u}`)
}
const ok = total === 0 && unreachable.length === 0
console.log(ok ? 'AFFORDANCE SCAN: PASS' : 'AFFORDANCE SCAN: FAIL')
process.exit(ok ? 0 : 1)
