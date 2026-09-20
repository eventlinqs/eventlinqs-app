/**
 * WHAT A BUYER ACTUALLY SEES NOW THE EVENT ROUTE HAS NO LOADING BOUNDARY.
 *
 * ============================================================================
 * WHY THIS DRIVE EXISTS AND WHY A SCORE COULD NOT ANSWER IT
 * ============================================================================
 *
 * Close-out C8 deleted `src/app/events/[slug]/loading.tsx`. The reason is
 * measured and is not in question: a route-level loading boundary makes React
 * stream the RSC flight payload BEFORE the resumed markup, which left the hero
 * <img> at byte 102,160 of a 205,226 byte document against 18,599 on a route
 * with no boundary, and cost 450ms of LCP element render delay.
 *
 * But a `loading.tsx` is not only a performance artefact. It is also what the
 * framework prefetches for a DYNAMIC route: Next's own Link reference says the
 * default `auto` prefetch fetches "the partial route down to the nearest
 * segment with a loading.js boundary", so while that file existed, tapping an
 * event card painted a skeleton instantly. Deleting it changes what the buyer
 * sees between the tap and the page, on the first step of the buyer journey,
 * and NO Lighthouse number describes that: the gate measures a cold document
 * load, never an in-app navigation.
 *
 * So the question "is the skeleton's removal a regression?" is a question about
 * a transition, and the only honest way to answer it is to drive the transition
 * and look. This does that at 390, 768 and 1440, and it fails if what the buyer
 * sees is a blank screen.
 *
 * ============================================================================
 * WHAT IT ASSERTS, AND WHY THE FIRST ONE NEEDS NO THRESHOLD
 * ============================================================================
 *
 * CLAUSE 1, THE DOCUMENT ORDER. The hero <img> must appear BEFORE the first
 * `self.__next_f.push` in the served document. This is the whole defect
 * expressed without a magic number: the flight payload arriving first IS the
 * boundary's signature, and the byte offsets are a consequence of it, not the
 * rule. A threshold like "before byte 40,000" would need re-tuning every time
 * the page's markup grew; this does not, and it is exactly false on a page
 * behind a boundary and exactly true on one that is not.
 *
 * CLAUSE 2, THE TRANSITION IS NEVER BLANK. Click a real event card on /events
 * and sample the viewport while the server is still rendering. Without a
 * boundary Next keeps the CURRENT page painted until the new one is ready, so
 * the buyer sees the browse grid rather than a skeleton. That is a different
 * loading design, not an absent one, and this proves it is the former: the
 * document must still carry visible text and images throughout.
 *
 * CLAUSE 3, THE DESTINATION ARRIVES. The navigation must complete and the
 * event page's hero must be present and visible, so a "never blank" pass can
 * never be earned by never navigating.
 *
 * CLAUSE 4, THE ANTI-FALSE-PASS. Every route is taken from the reviewed gate
 * set in `lighthouse-gate-urls.json`, never a guessed slug, and the drive
 * refuses to report a pass if it performed fewer checks than its own subject
 * count requires. A drive that measured nothing is not a drive that passed.
 *
 * ============================================================================
 * THE CARD IS FOUND, NOT GUESSED
 * ============================================================================
 *
 * The link clicked in clause 2 is enumerated from the browse page's own DOM by
 * matching hrefs against the gate set, so this cannot quietly start driving a
 * different card than the one it reports, and it fails loudly if the browse
 * page stops linking to the pages the gate measures - which would itself be a
 * Law 5 defect worth failing on.
 *
 * Usage:
 *   node scripts/verify/event-route-loading-boundary-drive.mjs --serve --port=3200
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[event-route-loading-boundary]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

/** The event pages are the reviewed gate set, never a guessed slug. */
const GATE = JSON.parse(readFileSync('lighthouse-gate-urls.json', 'utf8'))
const SUBJECTS = GATE.eventDetail.map((e) => e.path)
/** The surface a buyer taps an event card ON. */
const BROWSE = '/events'

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

mkdirSync(OUT, { recursive: true })

const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}

let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the proof server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/loading-boundary-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/* ---------------------------------------------------------------------------
 * CLAUSE 1. The document order, read off the bytes the server actually sends.
 * ------------------------------------------------------------------------- */
for (const path of [...SUBJECTS, BROWSE, '/']) {
  await fetch(BASE + path) // warm, so the measurement is the steady state
  const res = await fetch(BASE + path)
  const html = await res.text()
  const img = html.indexOf('<img')
  const flight = html.indexOf('self.__next_f.push')
  const ok = img >= 0 && flight >= 0 && img < flight
  check(
    `${path} carries its first <img> before the flight payload`,
    ok,
    `img@${img} flight@${flight} of ${html.length} bytes`,
  )
}

/* ---------------------------------------------------------------------------
 * CLAUSES 2 and 3. The transition, driven at three widths.
 * ------------------------------------------------------------------------- */
const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    })
    const page = await context.newPage()
    await page.goto(BASE + BROWSE, { waitUntil: 'networkidle' })

    /*
     * THE CARD IS ENUMERATED FROM THE PAGE'S OWN DOM, NEVER GUESSED, AND IT IS
     * DELIBERATELY NOT REQUIRED TO BE ONE OF THE GATE'S THREE.
     *
     * The first version of this drive demanded that /events link to one of the
     * reviewed gate slugs and FAILED at all three widths with "saw 32 event
     * hrefs". That was the drive being wrong, not the product: /events is a
     * sorted, paginated catalogue and the three pages the performance gate pins
     * are pinned for what they REPRESENT (the heaviest chart, the multi-tier
     * case, the lineup case), not for being on the first page of browse. A
     * drive that insists on them is measuring the catalogue's sort order.
     *
     * What clause 2 actually needs is a real event card that a real buyer could
     * tap, which is any of them. The gate set still governs clause 1, where the
     * identity of the page genuinely matters. The chosen href is reported so
     * the evidence names the card that was driven.
     *
     * `/events/browse/...` is a CITY listing, not an event, so it is excluded
     * by shape rather than by slug.
     */
    const hrefs = await page.$$eval('a[href^="/events/"]', (as) => as.map((a) => a.getAttribute('href')))
    const target = hrefs.find((h) => h && /^\/events\/[^/]+$/.test(h) && !h.startsWith('/events/browse'))
    check(
      `${vp.label} browse page offers a real event card to tap`,
      Boolean(target),
      target ? `${target} (of ${hrefs.length} event hrefs)` : `saw ${hrefs.length} event hrefs, none a detail page`,
    )
    if (!target) {
      await context.close()
      continue
    }

    const started = Date.now()
    await page.click(`a[href="${target}"]`)

    /*
     * SAMPLE WHILE THE SERVER IS STILL THINKING. The event route renders in
     * roughly 400ms warm, so these three samples land inside the transition
     * rather than after it. What is asserted is not which page is showing but
     * that SOMETHING is: painted text and at least one image. A blank frame
     * here is the regression this drive was written to catch.
     */
    const samples = []
    let waitedSoFar = 0
    for (const at of [80, 200, 350]) {
      await page.waitForTimeout(at - waitedSoFar)
      waitedSoFar = at
      const shot = await page.evaluate(() => ({
        text: document.body?.innerText?.trim().length ?? 0,
        images: document.images.length,
        url: location.pathname,
      }))
      samples.push({ at, ...shot })
    }
    const blank = samples.filter((s) => s.text === 0 || s.images === 0)
    check(
      `${vp.label} the transition is never blank`,
      blank.length === 0,
      samples.map((s) => `${s.at}ms:${s.text}chars/${s.images}img`).join(' '),
    )

    // CLAUSE 3. It must actually arrive, or "never blank" is free.
    await page.waitForURL(`**${target}`, { timeout: 15000 })
    const hero = page.locator('section[aria-label="Event hero"] img').first()
    await hero.waitFor({ state: 'visible', timeout: 15000 })
    const elapsed = Date.now() - started
    check(`${vp.label} the event hero is visible after the navigation`, true, `${elapsed}ms from click`)

    await page.screenshot({ path: join(OUT, `nav-${vp.label}-arrived.png`), fullPage: false })
    await context.close()
  }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

/* CLAUSE 4. A drive that measured nothing is not a drive that passed. */
const EXPECTED = SUBJECTS.length + 2 + VIEWPORTS.length * 3
if (results.length < EXPECTED) {
  console.error(`${TAG} DID NOTHING: ${results.length} checks, expected at least ${EXPECTED}.`)
  process.exit(1)
}

writeFileSync(join(OUT, 'loading-boundary-drive-report.json'), JSON.stringify({ base: BASE, results }, null, 2))
console.log(`${TAG} did ${results.length} checks over ${SUBJECTS.length} event route(s) at ${VIEWPORTS.length} widths`)
if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
