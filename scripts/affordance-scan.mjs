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

/*
 * BASE IS READ FROM THE ENVIRONMENT TOO, and until 14 September 2026 it was not.
 *
 * CLAUDE.md says this scan "runs beside the link-integrity crawler in the audit
 * suite on every pass". That crawler reads `process.argv[2] || process.env.BASE`.
 * This one read argv only, and fell back to a HARD-CODED preview URL for the
 * feat/home-rebuild branch. So the documented way to run the pair,
 *
 *     BASE=http://localhost:3100 node scripts/link-integrity-crawl.mjs
 *     BASE=http://localhost:3100 node scripts/affordance-scan.mjs
 *
 * aimed the first at the tree under test and the second at a months-old
 * deployment of a different branch, and printed AFFORDANCE SCAN: PASS about it.
 * Two tools that are always run together and are aimed differently is a trap
 * with no visible symptom: the pass is real, it is just about another website.
 */
const BASE = (process.argv[2] || process.env.BASE ||
  'https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const PAGES = [
  ['home', '/'],
  ['organisers', '/organisers'],
  ['pricing', '/pricing'],
  ['about', '/about'],
  ['events-browse', '/events'],
  /*
   * RESOLVED FROM THE RUNNING CATALOGUE, never typed. This entry used to be the
   * literal slug `aso-ebi-affair-owambe-garden-party`, and on 14 September 2026
   * that event no longer existed, so the one page type where a dead-end tile is
   * most likely had been answering 404 and being counted as clean. A slug in a
   * scan is a claim that goes stale silently: nothing about this file changes on
   * the day the event is unpublished.
   *
   * `EVENT_DETAIL` below is replaced before the loop with the first event the
   * browse page actually links to, which is the same thing a visitor clicks.
   */
  ['event-detail', 'EVENT_DETAIL'],
  ['city', '/city/sydney'],
  ['suburb', '/city/sydney/inner-west'],
  ['community', '/community/african'],
  ['communities-hub', '/communities'],
  ['category', '/events?category=music'],
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
 * The first event the browse page links to, which is the one a visitor clicks.
 * Read out of the running product rather than out of this file, so it cannot go
 * stale. A catalogue with nothing in it is left to fail loudly as a 404 below
 * rather than quietly skipped, because an events platform with no openable
 * event is a finding in itself.
 */
async function resolveEventDetail() {
  try {
    const html = await (await fetch(`${BASE}/events`, { headers: { 'user-agent': UA } })).text()
    const m = html.match(/href="(\/events\/[a-z0-9][a-z0-9-]*)"/i)
    return m ? m[1] : null
  } catch (error) {
    // Not swallowed: the scan continues and the unresolved entry fails below as
    // a page that did not load, but the READER needs to know the difference
    // between "the browse page linked to no event" and "the browse page could
    // not be reached at all", and only this line knows which it was.
    console.warn(`  could not read ${BASE}/events to resolve an event: ${String(error?.message ?? error)}`)
    return null
  }
}
const resolved = await resolveEventDetail()
for (const entry of PAGES) {
  if (entry[1] === 'EVENT_DETAIL') {
    entry[1] = resolved ?? '/events/(the browse page linked to no event)'
    console.log(`event-detail resolved from ${BASE}/events to ${entry[1]}`)
  }
}

const b = await chromium.launch({ args: ['--no-sandbox'] })
let total = 0
const notLoaded = []
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
    /*
     * A PAGE THAT DID NOT LOAD IS NOT EVIDENCE THAT IT HAS NO DEAD-END TILES.
     * This used to print "OK  communities-hub [404] dead-end tiles: 0" and
     * count it towards a PASS, which is true and worthless: a 404 body has no
     * tiles in it. Seven of the nineteen pages were reporting exactly that on
     * 14 September 2026, so a scan that said PASS across nineteen pages had
     * actually looked at twelve.
     */
    const viol = status === 200 ? await page.evaluate(DETECT) : []
    total += viol.length
    if (status !== 200) notLoaded.push(`${name} ${path} answered ${status}`)
    results.push({ name, path, status, violations: viol.length, detail: viol })
    const verdict = status !== 200 ? 'GONE' : viol.length === 0 ? 'OK  ' : 'FAIL'
    console.log(`${verdict} ${name.padEnd(14)} [${status}] dead-end tiles: ${status === 200 ? viol.length : 'not scanned, the page did not load'}`)
    if (viol.length) viol.slice(0, 6).forEach(v => console.log(`       - ${v.alt || '(no alt)'} ${v.w}x${v.h} ${v.src}`))
    await ctx.close()
  } catch (e) {
    results.push({ name, path, error: String(e).slice(0, 100) })
    console.log(`ERR  ${name}: ${String(e).slice(0, 80)}`)
  }
}
await b.close()
const scanned = PAGES.length - notLoaded.length
console.log(`\nTOTAL dead-end tiles across ${scanned} of ${PAGES.length} pages: ${total}`)
if (notLoaded.length) {
  console.log(`\n${notLoaded.length} page(s) did NOT load, so nothing was scanned on them:`)
  for (const n of notLoaded) console.log(`    ${n}`)
  console.log('')
  console.log('  Either the path is wrong in this file or the surface is broken, and both')
  console.log('  are findings. A scan cannot report a page clean without looking at it.')
}
const ok = total === 0 && notLoaded.length === 0
console.log(ok ? 'AFFORDANCE SCAN: PASS' : 'AFFORDANCE SCAN: FAIL')
process.exit(ok ? 0 : 1)
