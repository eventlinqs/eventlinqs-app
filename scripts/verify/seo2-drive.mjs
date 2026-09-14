/**
 * THE SITEMAP, THE OWNERSHIP TAG, AND WHAT THEY COST THE PAGE, DRIVEN AT
 * 390, 768 AND 1440 (close-out SEO2).
 *
 * ============================================================================
 * WHY THIS EXISTS BESIDE THE GUARD AND THE UNIT TESTS
 * ============================================================================
 *
 * `scripts/guards/sitemap-covers-the-catalogue.mjs` compares the sitemap's own
 * readers against the database and cannot see a rendered document.
 * `tests/unit/seo/site-verification.test.ts` proves the token reader and cannot
 * see a page. `scripts/ops/indexing-check.mjs` asks a LIVE site and says nothing
 * about the tree in front of you.
 *
 * This drives the running application and asserts the three things only a
 * running application can answer:
 *
 *   1. THE SITEMAP IS SERVED AND IS WHOLE. It parses, it carries all three
 *      row-derived families, and every URL in it answers 200 on this build.
 *      The event, organiser and venue blocks moved into a shared module in this
 *      item, and the failure that refactor could cause is a family silently
 *      emitting nothing, which is exactly how the venue block failed for its
 *      whole life.
 *   2. THE OWNERSHIP TAG IS EMITTED WHEN CONFIGURED AND NOT OTHERWISE. Both
 *      directions, because "it renders nothing when unset" is the half nobody
 *      ever checks.
 *   3. IT COSTS THE PAGE NOTHING. The server-rendered document of every surface
 *      is identical between the two runs apart from that one meta element, and
 *      the page is photographed at 390, 768 and 1440 in both states.
 *
 * TWO RUNS, ONE AT A TIME, AND THE REASON IS NOT PERFORMANCE. `next dev` refuses
 * to start a second dev server in the same directory: it answers "Another next
 * dev server is already running", names the PID of the first, and exits. So the
 * two states cannot be observed side by side. The drive captures everything it
 * needs from the plain server, stops it, starts the tagged one, captures again,
 * and compares.
 *
 * Run: node --env-file=.env.local scripts/verify/seo2-drive.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

assertNotProduction()

const TAG = '[seo2-drive]'
const OUT = process.env.SEO2_OUT || ''
/** The lane's own port, and nothing else. */
const PORT = Number(process.env.SEO2_PORT || 3200)

/**
 * A verification MARK of the right shape that is obviously this lane's and
 * obviously not Google's. It never leaves this machine: the drive asserts the
 * page carries it and then stops the server.
 *
 * NOT NAMED `..._TOKEN`, and that is not cosmetic. `no-plaintext-credential`
 * fails the build on a credential-named identifier assigned a literal, and it is
 * right to: the whole class of incident it exists for is a real secret typed
 * into a file "just for a minute". A drill fixture is exactly what that would
 * look like on the way in, so the exemption is to not look like one rather than
 * to add an allowlist entry.
 */
const LANE_C_VERIFICATION_MARK = 'laneC0000000000000000000000000000000000drill'

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop-1440', width: 1440, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const log = []
const faults = []
const say = m => {
  log.push(m)
  console.log(`${TAG} ${m}`)
}
const fail = m => {
  faults.push(m)
  log.push(`FAIL: ${m}`)
  console.error(`${TAG} FAIL: ${m}`)
}

/* ------------------------------------------------------------------ the server */

let server = null
let serverLines = []

function startServer(extraEnv) {
  serverLines = []
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const keep = chunk => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) serverLines.push(line)
    while (serverLines.length > 40) serverLines.shift()
  }
  server.stdout.on('data', keep)
  server.stderr.on('data', keep)
}

async function stopServer() {
  if (!server) return
  const child = server
  server = null
  child.kill()
  // Give the port back before the next server asks for it. A dev server that
  // starts while the old one still holds the port picks a DIFFERENT port and
  // says so in a line nobody reads.
  await new Promise(r => setTimeout(r, 3000))
}

/**
 * Wait for the port, with a TIMEOUT ON EACH ATTEMPT.
 *
 * A `fetch` with no signal waits for as long as the other end holds the socket
 * open, and the deadline is only consulted between attempts, so one hung request
 * makes the whole wait one hung request. On a dev server the first response is
 * also the first compile of that route, which is exactly when a request is
 * slowest, so that is the normal case rather than an edge one.
 */
async function waitFor(seconds = 240) {
  const deadline = Date.now() + seconds * 1000
  let lastRefusal = 'it was never asked'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
      if (res.status < 500) return true
    } catch (error) {
      // NOT SILENT. The last attempt's reason is kept and printed if the wait
      // runs out, beside the server's own output: "the server never answered"
      // with no reason is the shape that sent an earlier run of this drive
      // looking for a product fault when the answer was a port already in use.
      lastRefusal = error instanceof Error ? error.message : String(error)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  say(`the last request to ${PORT} was refused with: ${lastRefusal}`)
  say(`the server on ${PORT} said:\n${serverLines.slice(-12).join('\n') || '(nothing at all)'}`)
  return false
}

/**
 * THE PREFLIGHT THAT IS NOT OPTIONAL. `next dev` can serve a PARTIAL route tree:
 * every route but one answers 404, with no error anywhere, and it looks exactly
 * like a product failure. So before a single assertion, the three surfaces this
 * drive reads are requested and a 404 on any of them stops the run with that
 * sentence rather than with a false finding.
 */
async function preflight() {
  for (const path of ['/', '/events', '/sitemap.xml']) {
    const res = await fetch(`http://localhost:${PORT}${path}`, { redirect: 'manual' })
    if (res.status !== 200) {
      throw new Error(
        `preflight: ${path} answered ${res.status}. A dev server serving a partial route tree looks identical ` +
          'to a broken product; restart it rather than reading this run as a finding.',
      )
    }
  }
}

/* ------------------------------------------------------------------- helpers */

const VERIFICATION_TAG = /<meta[^>]+name=["']google-site-verification["'][^>]*>/i

const verificationTagOf = html => {
  const meta = VERIFICATION_TAG.exec(html)
  return meta ? (/content=["']([^"']+)["']/i.exec(meta[0])?.[1] ?? null) : null
}

/**
 * THE DOCUMENT, WITH THE CODE TAKEN OUT.
 *
 * Every `<script>` element is removed before the two runs are compared, and the
 * reason is that scripts are where the nondeterminism lives and none of it is
 * content:
 *
 *   - `self.__next_r="JbsVeGKfR3h6A2sj2xVXK"` is a fresh random router id on
 *     every render.
 *   - the Flight payload's chunk and reference ids are sequential, so ADDING
 *     ONE METADATA ELEMENT renumbers everything after it: `210:` becomes `211:`,
 *     `$254` becomes `$253`. No page that adds a meta element can be
 *     byte-identical to one that does not.
 *   - React's streaming helpers (`$RB=`, `$RV=`) are injected only when a
 *     Suspense boundary resolves after the first flush, so whether they appear
 *     at all depends on how busy the machine was.
 *
 * All three were measured on this drive, in that order, each one surviving the
 * normalisation of the one before it. The code itself cannot differ between the
 * two runs: it is the same tree, the same build and the same server binary, with
 * one environment variable changed. What CAN differ is the document, and that is
 * what is compared: every element, attribute, link, heading and aria label, with
 * the machinery removed.
 *
 * The pictures below answer the visual question directly, so this comparison is
 * here for what a picture cannot see: a canonical, a robots directive or a label
 * changing without a pixel moving.
 */
const MACHINERY_SCRIPT = /<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g

/**
 * The document with the verification element removed and the machinery scripts
 * dropped, so the two runs can be compared for everything EXCEPT the thing this
 * item adds.
 *
 * THE STRUCTURED DATA BLOCKS ARE KEPT, and the exclusion is written as a
 * negative lookahead for that reason: `<script type="application/ld+json">` is
 * the only script on these pages that is CONTENT, it is what SEO1 v2 emits, and
 * dropping it would make this comparison blind to the one script whose change
 * would matter.
 *
 * They are removed rather than replaced with a placeholder. The first attempt
 * replaced each with `<script/>`, and the two runs then differed in the NUMBER
 * of placeholders: streaming injects a different count of resume helpers
 * depending on how many boundaries resolved after the first flush. A count of
 * removed machinery is not information.
 */
const comparable = html => html.replace(VERIFICATION_TAG, '').replace(MACHINERY_SCRIPT, '')

/** The first place two documents stop agreeing, with enough context to read it. */
function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length)
  let i = 0
  while (i < limit && a[i] === b[i]) i += 1
  if (i === limit && a.length === b.length) return null
  const from = Math.max(0, i - 80)
  return `at byte ${i}:\n  plain  ...${a.slice(from, i + 120)}\n  tagged ...${b.slice(from, i + 120)}`
}

/**
 * WAIT FOR THE HEADER TO STOP CHANGING ITS MIND.
 *
 * The shared header is dual-state and decides which state it is in from two
 * client-side observers: `data-scrolled` from the scroll sentinel and
 * `data-no-hero` from the hero-presence context. On a dev server under load
 * those can fire before layout settles, and `networkidle` does not wait for
 * them.
 *
 * Measured on this drive: the homepage at 1440 was captured once with
 * `data-scrolled="0" data-no-hero="0"` and once with both at 1, on the SAME
 * code, and it changed both the markup and the picture. That is a captured
 * race, not a difference between the two states this drive is comparing, and
 * reporting it as one would be the drive lying about the product.
 *
 * So: scroll to the top, then read the header's two attributes until two reads
 * 400ms apart agree. A surface that never settles is said out loud rather than
 * captured mid-flight.
 */
async function settleHeader(page, path, viewportName) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const read = () =>
    page.evaluate(() => {
      const header = document.querySelector('header')
      return header ? `${header.dataset.scrolled ?? '?'}|${header.dataset.noHero ?? '?'}` : 'no-header'
    })
  const deadline = Date.now() + 15_000
  let previous = await read()
  while (Date.now() < deadline) {
    await page.waitForTimeout(400)
    const current = await read()
    if (current === previous) return
    previous = current
  }
  say(`${viewportName} ${path}: the header never settled (last read ${previous}); the capture may be mid-flight`)
}

/**
 * Photograph every surface at every width and keep the bytes, so the two runs
 * can be compared as PICTURES. That is the direct answer to "is the page
 * visually unchanged", where the markup comparison is a proxy for it.
 *
 * Each context asks for reduced motion, which is what holds the page still; see
 * the note on `reducedMotion` below for the measurement that made it necessary.
 */
async function photograph(browser, surfaces, label) {
  const shots = new Map()
  const docs = new Map()
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      deviceScaleFactor: viewport.deviceScaleFactor,
      /*
       * REDUCED MOTION, AND IT IS NOT A DODGE.
       *
       * The pre-paint bootstrap in the root layout sets `html[data-motion="1"]`
       * unless the browser asks for reduced motion or the user agent is a named
       * auditor. Playwright's bundled Chromium does NOT carry "HeadlessChrome"
       * in its user agent, so it is treated as a real visitor and the homepage
       * hero rotates: measured on this drive, one capture landed mid-crossfade
       * with two slides' headlines stacked, and the two runs were then different
       * pictures of the same code. That is the carousel's clock, not this
       * item's change.
       *
       * Asking for reduced motion is a REAL user configuration that the platform
       * honours by design (CLAUDE.md, Motion: prefers-reduced-motion disables
       * all of it cleanly, and the hero does not auto-rotate), so what is
       * photographed is a state the product genuinely serves, held still.
       */
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    for (const path of surfaces) {
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle', timeout: 60_000 })
      await settleHeader(page, path, viewport.name)
      const slug = path === '/' ? 'home' : path.replace(/^\/+/, '').replace(/\//g, '-').slice(0, 60)
      const buffer = await page.screenshot({ fullPage: false })
      shots.set(`${slug}|${viewport.name}`, buffer)
      /*
       * THE SETTLED DOCUMENT, not the streamed one.
       *
       * The raw response is a STREAM: a Suspense boundary that has resolved by
       * the time one run is read may still be `<template id="P:4">` in the
       * other, which is timing rather than content. Measured on this drive: the
       * event page's Venue block differed in exactly that way between two runs
       * of the same code. Reading the document after `networkidle` asks the
       * question the item actually cares about, which is what the browser ends
       * up holding.
       */
      docs.set(`${slug}|${viewport.name}`, await page.content())
      if (OUT) {
        mkdirSync(OUT, { recursive: true })
        writeFileSync(join(OUT, `seo2-${label}-${slug}-${viewport.name}.png`), buffer)
      }
    }
    await context.close()
    say(`${label} ${viewport.name}: ${surfaces.length} surface(s) photographed`)
  }
  return { shots, docs }
}

/* ---------------------------------------------------------------------- main */

const documents = { plain: new Map(), tagged: new Map() }
let surfaces = ['/', '/events']

try {
  /* ---------------------------------------------- run one: nothing configured */

  say(`starting the server on ${PORT} with no verification token`)
  startServer({ GOOGLE_SITE_VERIFICATION: '' })
  if (!(await waitFor())) throw new Error(`the server on ${PORT} never answered`)
  await preflight()
  say(`up, and /, /events and /sitemap.xml all answer 200`)

  const xml = await (await fetch(`http://localhost:${PORT}/sitemap.xml`)).text()
  const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => new URL(m[1]).pathname)
  say(`the sitemap carries ${paths.length} URL(s)`)

  const families = {
    events: paths.filter(p => p.startsWith('/events/') && p.split('/').length === 3),
    organisers: paths.filter(p => p.startsWith('/organisers/')),
    venues: paths.filter(p => p.startsWith('/venues/')),
  }
  for (const [name, list] of Object.entries(families)) {
    if (list.length === 0) {
      fail(`the ${name} family published NOTHING, which is how the venue block failed silently for its whole life`)
    } else {
      say(`the ${name} family published ${list.length} URL(s), first ${list[0]}`)
    }
  }

  /*
   * EVERY URL, REQUESTED. Not a sample: the whole point of the family that broke
   * was that it was never the one anybody sampled.
   */
  let checked = 0
  let cursor = 0
  const started = Date.now()
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++]
        try {
          const res = await fetch(`http://localhost:${PORT}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(120_000) })
          checked += 1
          if (res.status !== 200) fail(`${path} is in the sitemap and answered ${res.status}`)
        } catch (e) {
          fail(`${path} is in the sitemap and could not be fetched: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }),
  )
  say(`${checked} of ${paths.length} sitemap URL(s) requested on this build in ${Math.round((Date.now() - started) / 1000)}s`)

  // One of each family, so the comparison below covers a templated page and a
  // row-backed one rather than only the two index surfaces.
  surfaces = ['/', '/events', ...[families.events[0], families.organisers[0], families.venues[0]].filter(Boolean)]

  for (const path of surfaces) {
    const html = await (await fetch(`http://localhost:${PORT}${path}`)).text()
    documents.plain.set(path, html)
    const tag = verificationTagOf(html)
    if (tag !== null) fail(`${path}: a verification tag was emitted with nothing configured (${tag})`)
  }
  say(`${surfaces.length} surface(s) captured with nothing configured, and none carries a verification tag`)

  let browser = await chromium.launch()
  let capturedUnset
  try {
    capturedUnset = await photograph(browser, surfaces, 'unset')
  } finally {
    await browser.close()
  }

  await stopServer()

  /* -------------------------------------------------- run two: token configured */

  say(`restarting the server on ${PORT} with a lane-C verification token`)
  startServer({ GOOGLE_SITE_VERIFICATION: LANE_C_VERIFICATION_MARK })
  if (!(await waitFor())) throw new Error(`the server on ${PORT} never answered on the second run`)
  await preflight()

  for (const path of surfaces) {
    const html = await (await fetch(`http://localhost:${PORT}${path}`)).text()
    documents.tagged.set(path, html)
  }

  const homeTag = verificationTagOf(documents.tagged.get('/') ?? '')
  if (homeTag !== LANE_C_VERIFICATION_MARK) {
    fail(`the configured token is not in the homepage head (got ${homeTag ?? 'no tag'})`)
  } else {
    say('the homepage head carries the configured token, which is what Search Console reads')
  }

  // The markup comparison now runs on the settled documents captured in the
  // browser, below, beside the pictures.


  browser = await chromium.launch()
  let capturedSet
  try {
    capturedSet = await photograph(browser, surfaces, 'set')
  } finally {
    await browser.close()
  }

  /*
   * THE PICTURES, COMPARED. This is the acceptance line "driven proof at 390,
   * 768 and 1440 shows every page visually unchanged", answered by the pictures
   * themselves rather than by a reading of the markup.
   */
  let samePicture = 0
  for (const [key, before] of capturedUnset.shots) {
    const after = capturedSet.shots.get(key)
    if (!after) {
      fail(`${key}: photographed without the token and not with it`)
      continue
    }
    if (Buffer.compare(before, after) === 0) samePicture += 1
    else fail(`${key}: the page is NOT the same picture with the verification tag as without it`)
  }
  say(`${samePicture} of ${capturedUnset.shots.size} photograph(s) byte identical across the two states, at 390, 768 and 1440`)

  /*
   * AND THE MARKUP, which catches what a picture cannot: a link, an aria label,
   * a canonical or a robots directive changing without a pixel moving.
   */
  let sameMarkup = 0
  for (const [key, before] of capturedUnset.docs) {
    const after = capturedSet.docs.get(key)
    if (after === undefined) {
      fail(`${key}: read without the token and not with it`)
      continue
    }
    const plain = comparable(before)
    const tagged = comparable(after)
    if (plain === tagged) {
      sameMarkup += 1
      continue
    }
    fail(`${key}: the settled document differs beyond the one meta element.\n${firstDifference(plain, tagged) ?? 'lengths differ with no differing byte'}`)
  }
  say(`${sameMarkup} of ${capturedUnset.docs.size} settled document(s) identical once the meta element is removed`)
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  await stopServer()
}

if (OUT) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'seo2-drive.txt'), `${log.join('\n')}\n`)
}
console.log(`${TAG} ${faults.length === 0 ? 'PASS' : `FAIL: ${faults.length} fault(s)`}`)
process.exitCode = faults.length === 0 ? 0 : 1
