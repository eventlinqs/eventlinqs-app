/**
 * THE HERO'S PRELOAD IS IN THE HEAD, AND THERE IS EXACTLY ONE OF IT.
 *
 * WHY THIS EXISTS. Close-out C8B.3 asks for a change to be proven on the route
 * it was made for, at 390, 768 and 1440. The change moved one route family's
 * hero preload out of the body and into the head. Two things can go wrong with
 * that and only one of them is visible in a screenshot:
 *
 *   1. THE PRELOAD IS STILL LATE. That is the defect being fixed: with a
 *      route-level `loading.tsx` the head closes with the SKELETON, so the link
 *      next/image emits when the hero renders came out at byte 85,041 of a
 *      205,060 byte document. Lighthouse charged it as `Resource load delay`,
 *      median 331ms on cat-indie and 533ms on the arena page.
 *
 *   2. THERE ARE NOW TWO OF THEM. This is the failure mode a fix creates, it is
 *      strictly worse than the defect, and it HAPPENED during this build: a
 *      `<link rel="preload" href=...>` element reaches the head and does not
 *      dedupe with next/image's registration, because React hoists a link
 *      element keyed on `href` and registers an image resource keyed on
 *      `imageSrcSet + "\n" + imageSizes`. The document came back carrying two
 *      preloads for one photograph. A second request for the LCP image, on the
 *      slowest route on the platform, would be invisible in every screenshot
 *      and in every Lighthouse score that is not read to the network panel.
 *
 * SO THIS DRIVES A REAL BROWSER AND COUNTS TRANSFERS, not just markup. Clause 4
 * is the one that could not be written any other way: it asks Chrome how many
 * times it actually DOWNLOADED the hero variant, which is not the same as how
 * many times it asked for it. That distinction is written out where the counting
 * happens, because reading it the easy way reported a double download that was
 * not there.
 *
 * IT FOUND A SECOND DEFECT ON ITS FIRST RUN, which is recorded because it is the
 * better argument for driving than anything above. With the audit cookie set,
 * the hero photograph was being DECODED twice on every event page: the
 * ken-burns ambient layer was mounting inside the measurement, because its
 * suppression read `document.body.dataset.headless` while the flag is written to
 * `documentElement`. Five more components had the same dead read. See
 * src/lib/ui/audit-mode.ts.
 *
 * WHAT IT REFUSES TO DO. It does not judge a route it was not given, it does not
 * guess a slug (the event set is read from `lighthouse-gate-urls.json`, the
 * pinned reviewed set the Lighthouse gate itself audits), and it counts its own
 * checks so a run that measured nothing cannot report a pass. Zero checks exits
 * non-zero: a harness that fails quietly is how this repository lost a day to
 * six proofs that all accused the product.
 *
 * THE CONTROL ROUTE MATTERS AS MUCH AS THE SUBJECTS. `/events` has no loading
 * boundary and never had this defect, so it is driven too: if the control ever
 * stops having its preload in the head, the change has broken something general
 * rather than fixed something specific.
 *
 * Usage:
 *   node scripts/verify/hero-preload-in-the-head-drive.mjs --serve --port=3200
 *   node scripts/verify/hero-preload-in-the-head-drive.mjs http://127.0.0.1:3200
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[hero-preload-in-the-head]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8-HEROPRELOAD')
let BASE = args.find((a) => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`

/** The event pages are the reviewed gate set, never a guessed slug. */
const GATE = JSON.parse(readFileSync('lighthouse-gate-urls.json', 'utf8'))
const SUBJECTS = GATE.eventDetail.map((e) => e.path)
/** A route with NO loading boundary, which never had the defect. */
const CONTROL = '/events'

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
  const started = await startGateServer(envFor('local'), '.tmp/hero-preload-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/**
 * The raw document, so the byte offsets are measured on what the browser is
 * actually sent rather than on a DOM that has already been assembled.
 */
async function fetchDocument(path) {
  const res = await fetch(BASE + path, { headers: { Cookie: 'el-audit=1' } })
  return { status: res.status, html: await res.text() }
}

/** Every `<link rel=preload as=image>` in the document, with where it sits. */
function imagePreloads(html) {
  const headEnd = html.indexOf('</head>')
  const found = []
  for (const m of html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)) {
    if (!/as="image"/.test(m[0])) continue
    found.push({ at: m.index, inHead: headEnd >= 0 && m.index < headEnd, tag: m[0] })
  }
  return { headEnd, found, docLength: html.length }
}

const decode = (s) => (s == null ? s : s.replaceAll('&amp;', '&').replaceAll('&quot;', '"'))
const attr = (tag, name) => decode(new RegExp(`${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? null)

const report = { base: BASE, takenAt: new Date().toISOString(), routes: [] }

const browser = await chromium.launch()
try {
  for (const path of [...SUBJECTS, CONTROL]) {
    const isSubject = SUBJECTS.includes(path)
    const { status, html } = await fetchDocument(path)
    check(`${path} answers 200`, status === 200, `HTTP ${status}`)
    if (status !== 200) continue

    const { headEnd, found, docLength } = imagePreloads(html)

    // CLAUSE 1. Exactly one. Two is a second download of the LCP image.
    check(
      `${path} carries exactly one image preload`,
      found.length === 1,
      `${found.length} found in a ${docLength} byte document`,
    )

    // CLAUSE 2. In the head, where the preload scanner reaches it first.
    const first = found[0]
    check(
      `${path} puts the image preload in the head`,
      Boolean(first?.inHead),
      first
        ? `at byte ${first.at} of ${docLength}, </head> at ${headEnd}` +
          (isSubject ? ' (it was at ~85,000 before this change)' : ' (control: never had the defect)')
        : 'no image preload at all',
    )
    if (!first) continue

    report.routes.push({ path, docLength, headEnd, preloadAt: first.at, inHead: first.inHead })

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      })
      await context.addCookies([{ name: 'el-audit', value: '1', url: BASE }])
      const page = await context.newPage()

      /*
       * TRANSFERS, NOT REQUEST EVENTS, AND THE DIFFERENCE IS THE WHOLE POINT.
       *
       * A working preload produces TWO request events for one photograph: the
       * link fetches it, and the `<img>` then asks for the same URL and is
       * served from the preload cache. Counting events reported "2" on every
       * event page and read as a double download, which it is not. Measured on
       * this build, the two events for the hero were
       * `responseBodySize: 15467` and `responseBodySize: -1521`: one real
       * download and one cache hit, which is a negative body size in Chrome's
       * accounting.
       *
       * So this counts responses that actually carried bytes. A preload whose
       * key diverges from the element's asks for a DIFFERENT url and both
       * transfer, which is the regression this clause exists for, and it still
       * fails.
       */
      const optimiserHits = []
      page.on('requestfinished', async (r) => {
        if (!r.url().includes('/_next/image?')) return
        let bodySize = 0
        try {
          bodySize = (await r.sizes()).responseBodySize ?? 0
        } catch {
          // Unreadable is not zero: count it, so a size this harness cannot see
          // is a loud extra rather than a silent absence.
          bodySize = 1
        }
        if (bodySize > 0) optimiserHits.push(r.url())
      })

      await page.goto(BASE + path, { waitUntil: 'load' })
      await page.waitForTimeout(1200)

      /*
       * CLAUSE 5. THE AUDIT FLAG IS WHERE THE SUPPRESSIONS LOOK FOR IT.
       *
       * This is the premise every one of them rests on, and it was FALSE for
       * six of the eight readers until 20 September 2026: the layout writes the
       * flag to documentElement and they read document.body. Asserting it on a
       * really served page, in a real browser, is the only place the premise
       * itself can be checked; the unit test checks the predicate's answer and
       * the guard checks that every suppression asks the predicate, and neither
       * can see whether the flag actually arrives.
       *
       * The negative half matters as much: body must NOT carry it, or a future
       * "fix" that writes it to both would make the old dead reads work again
       * and hide the next occurrence.
       */
      const flag = await page.evaluate(() => ({
        onDocumentElement: document.documentElement.dataset.headless ?? null,
        onBody: document.body.dataset.headless ?? null,
      }))
      check(
        `${path} at ${vp.label}: the audit flag is on documentElement, where every suppression now reads it`,
        flag.onDocumentElement === '1' && flag.onBody === null,
        `documentElement=${flag.onDocumentElement}, body=${flag.onBody}`,
      )

      // CLAUSE 3. The preload names exactly what the hero <img> asks for.
      const hero = await page.evaluate(() => {
        const img = document.querySelector('section[aria-label="Event hero"] img, main img[fetchpriority="high"], img[fetchpriority="high"]')
        if (!img) return null
        return { srcSet: img.getAttribute('srcset'), sizes: img.getAttribute('sizes'), currentSrc: img.currentSrc }
      })
      check(
        `${path} at ${vp.label}: the hero raster is on the page`,
        Boolean(hero),
        hero ? 'found' : 'no fetchpriority=high image',
      )
      if (hero) {
        check(
          `${path} at ${vp.label}: the preload names the same srcset the <img> does`,
          attr(first.tag, 'imagesrcset') === hero.srcSet,
          attr(first.tag, 'imagesrcset') === hero.srcSet
            ? 'identical'
            : `preload asked for ${String(attr(first.tag, 'imagesrcset')).slice(0, 60)}... and the img asks for ${String(hero.srcSet).slice(0, 60)}...`,
        )
        check(
          `${path} at ${vp.label}: the preload names the same sizes hint the <img> does`,
          attr(first.tag, 'imagesizes') === hero.sizes,
          `${attr(first.tag, 'imagesizes')} vs ${hero.sizes}`,
        )

        // CLAUSE 4. One request for the hero, from a real browser.
        const chosen = hero.currentSrc ? new URL(hero.currentSrc).search : null
        const forTheHero = chosen ? optimiserHits.filter((u) => new URL(u).search === chosen) : []
        check(
          `${path} at ${vp.label}: the browser DOWNLOADED the hero variant once`,
          chosen != null && forTheHero.length === 1,
          chosen == null ? 'the img reported no currentSrc' : `${forTheHero.length} transfer(s) for ${chosen.slice(0, 70)}`,
        )
      }

      await page.screenshot({
        path: join(OUT, `hero-preload-${path.replaceAll('/', '-').replace(/^-/, '')}-${vp.label}.png`),
        fullPage: false,
      })
      await context.close()
    }
  }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

/*
 * A RUN THAT MEASURED NOTHING IS NOT A PASS. The count is the anti-false-pass:
 * a wrong selector, an empty gate set or a server that answered 500 on every
 * route would otherwise print "0 failures" and read as green.
 */
const EXPECTED_MIN = (SUBJECTS.length + 1) * 2 + SUBJECTS.length * VIEWPORTS.length * 5
if (results.length < EXPECTED_MIN) {
  console.error(
    `${TAG} REFUSING TO PASS: ${results.length} check(s) ran and at least ${EXPECTED_MIN} were expected ` +
      `(${SUBJECTS.length} subject route(s) plus one control, at ${VIEWPORTS.length} widths). Something measured nothing.`,
  )
  process.exit(2)
}

const file = join(OUT, 'hero-preload-drive.json')
writeFileSync(file, JSON.stringify({ ...report, checks: results.length, failures, results }, null, 2))
console.log(`${TAG} did ${results.length} checks over ${SUBJECTS.length + 1} route(s) at ${VIEWPORTS.length} widths`)
console.log(`${TAG} found ${failures} failure(s)`)
console.log(`${TAG} written: ${file}`)
process.exit(failures === 0 ? 0 : 1)
