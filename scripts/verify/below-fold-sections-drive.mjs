/**
 * DRIVE: a page whose sections skip rendering until they are near the viewport
 * still has all of its content, at its real size, and does not move under the
 * reader as they scroll.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026. `cv-section`
 * (content-visibility: auto, contain-intrinsic-size: auto 480px) had been on
 * the homepage rails since 6 September and on nothing else. Measured at 390,
 * /city/melbourne rendered 1,866 nodes across 11 sections with ZERO
 * content-visibility and spent 705 ms in Style & Layout before it could paint.
 * Putting the same treatment on `ContentSection` gives it to every template
 * that uses one: city, suburb, category, community, organiser, venue, help,
 * guides and the marketing pages.
 *
 * ============================================================================
 * THE HAZARD IS NOT "DOES IT LOOK RIGHT", IT IS "DOES IT STAY STILL"
 * ============================================================================
 *
 * `content-visibility: auto` asks the browser to guess a height for content it
 * has not laid out. `contain-intrinsic-size: auto 480px` means "assume 480px
 * until you have seen it once, then remember". Every section whose real height
 * is not 480px therefore changes the page's scroll height the first time it is
 * rendered, and a reader scrolling through a page whose scrollbar keeps
 * re-scaling is the cost of this technique when it is applied carelessly.
 *
 * So this drive scrolls the whole page the way a reader does and measures:
 *
 *   1. SCROLL HEIGHT DRIFT THAT THE TREATMENT ITSELF CAUSES. How much the
 *      document's height changed between first paint and the bottom - and
 *      then the same measurement again with `content-visibility` forced off,
 *      so the two can be subtracted.
 *
 *      MEASURING IT ONCE IS NOT ENOUGH, and the first version of this drive
 *      did exactly that and produced a number nobody could act on: /events
 *      drifted 79% at 390 and 233% at 1440 while carrying NO
 *      content-visibility anywhere, because its results grid loads more as
 *      the reader scrolls. Legitimate growth and a bad intrinsic-size
 *      estimate look identical from one pass. With the second pass they do
 *      not: /city/melbourne drifted 59.6% as shipped and 0.0% with the
 *      treatment forced off, which is how that regression was attributed to
 *      the estimate rather than to the page.
 *   2. EVERY SECTION HAS A REAL SIZE. A section that renders to zero height
 *      after being scrolled to is content that has gone missing, which is the
 *      failure that would matter most and the one a screenshot of the top of
 *      the page would never show.
 *   3. NOTHING IS NEWLY CLIPPED. Paint containment clips overflow, so a
 *      section whose content is wider than its box would lose the overhang.
 *      ONLY SECTIONS THE TREATMENT APPLIES TO ARE JUDGED, and only those that
 *      do not already clip themselves. The first version of this clause
 *      judged every section and went red on three pages: the offender was a
 *      decorative full-bleed band, 110% of the viewport wide, inside a
 *      section that declares `overflow-hidden` and carries no
 *      content-visibility at all. It was identical with the treatment forced
 *      off, which is how it was established as pre-existing rather than
 *      caused - a check that reports a fact about the page as a fault of the
 *      change is worse than no check.
 *   4. THE MECHANISM ACTUALLY ENGAGED. If no element reports
 *      content-visibility: auto, the change is not in the page at all and a
 *      clean pass would be meaningless.
 *
 * Usage (paths carry NO leading slash: MSYS rewrites one into a Windows path):
 *   node scripts/verify/below-fold-sections-drive.mjs --serve --port=3200 --path=city/melbourne
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[below-fold-sections]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const SHOTS = args.find(a => a.startsWith('--shots='))?.split('=')[1]
let BASE = args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`
const PATHS = (() => {
  const given = args.filter(a => a.startsWith('--path=')).map(a => a.split('=')[1])
  if (given.length === 0) return ['/']
  return given.map(p => (p === 'home' || p === '' ? '/' : p.startsWith('/') ? p : `/${p}`))
})()

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 900 },
]

/**
 * A real visitor's user agent, because `[data-headless="1"]` disables every
 * transition and the reveal animation, and a page whose sections are revealed
 * by an IntersectionObserver behaves differently when that is switched off.
 * The point here is to measure what a reader gets.
 */
const REAL_VISITOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/**
 * How much of the document's growth may be the TREATMENT'S doing, as a share
 * of its own height, after the page's own lazy growth has been subtracted.
 *
 * DERIVED FROM MEASUREMENT, and the derivation is here because a budget
 * chosen to make today's tree green is not a budget.
 *
 *   the homepage, whose rails have carried this treatment since
 *   6 September 2026 and which is the accepted state of the platform:
 *       10.6% at 390, 8.4% at 768, 8.7% at 1440
 *       reproduced identically on three consecutive runs, so this is the
 *       page's behaviour and not measurement noise
 *
 *   /city/melbourne with the treatment extended to ContentSection, the
 *   change this drive was written for and which it rejected:
 *       102.7% at 390, 59.6% at 768, 45.0% at 1440
 *
 * 15% sits above the first and nowhere near the second. It is not a
 * statement that 10.6% is good: a rail is about 480px and the estimate is
 * 480px, so the homepage's own residue is the sections that are not rails,
 * and somebody may want to reduce it. It is a statement that the gap between
 * "this is tuned" and "this is four times wrong" is wide enough to fail on
 * without argument.
 */
const DRIFT_BUDGET = 0.15

const faults = []
const notes = []
function check(ok, message) {
  if (!ok) faults.push(message)
  console.log(`${TAG}   ${ok ? 'ok  ' : 'FAIL'} ${message}`)
}

let stopServer = null
if (SERVE) {
  try {
    await refuseUnlessThePortIsFree(PORT, 'before the measurement server was started', 'pass --port= for one this lane owns')
  } catch (error) {
    console.error(`${TAG} REFUSING: ${error.message}`)
    process.exit(1)
  }
  mkdirSync('.tmp', { recursive: true })
  const started = await startGateServer(envFor('local'), '.tmp/below-fold-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

const MEASURE = `(() => {
  const sections = [...document.querySelectorAll('section')];
  return {
    scrollHeight: document.documentElement.scrollHeight,
    sections: sections.map((s, i) => {
      const cs = getComputedStyle(s);
      return {
        i,
        contentVisibility: cs.contentVisibility,
        overflowX: cs.overflowX,
        height: Math.round(s.getBoundingClientRect().height),
        clientWidth: s.clientWidth,
        scrollWidth: s.scrollWidth,
        headings: s.querySelectorAll('h1,h2,h3').length,
        children: s.children.length,
      };
    }),
  };
})()`

/**
 * One pass over a page: load it, measure, scroll it the way a reader does,
 * measure again. `forceVisible` turns the treatment off in the browser rather
 * than in the tree, so both passes run against the SAME build - the only
 * honest way to attribute a difference to it without a second build.
 */
async function pass(browser, path, vp, { forceVisible }) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: REAL_VISITOR_UA,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  if (forceVisible) {
    await page.addInitScript(
      `document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style')
        s.textContent = 'section{content-visibility:visible !important}'
        document.head.appendChild(s)
      })`,
    )
  }
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const before = await page.evaluate(MEASURE)
  await page.evaluate(`(async () => {
    const step = window.innerHeight;
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 400));
  })()`)
  const after = await page.evaluate(MEASURE)
  return { status: res?.status(), before, after, page, context }
}

const browser = await chromium.launch()
try {
  for (const path of PATHS) {
    for (const vp of VIEWPORTS) {
      const key = `${path} ${vp.label}`

      const shipped = await pass(browser, path, vp, { forceVisible: false })
      check(shipped.status === 200, `${key}: the page answered ${shipped.status}`)

      const engaged = shipped.before.sections.filter(s => s.contentVisibility === 'auto').length
      check(
        engaged > 0,
        `${key}: ${engaged} of ${shipped.before.sections.length} section(s) skip rendering until near the viewport`,
      )

      /* The same page again with the treatment switched off in the browser.
       * Its drift is the page's OWN lazy growth, and subtracting it leaves
       * what the intrinsic-size estimate costs. */
      const control = await pass(browser, path, vp, { forceVisible: true })
      const driftOf = (r) => Math.abs(r.after.scrollHeight - r.before.scrollHeight) / (r.before.scrollHeight || 1)
      const shippedDrift = driftOf(shipped)
      const ownDrift = driftOf(control)
      const attributable = Math.max(0, shippedDrift - ownDrift)
      check(
        attributable <= DRIFT_BUDGET,
        `${key}: the treatment moved the page height by ${(attributable * 100).toFixed(1)}% ` +
          `(as shipped ${(shippedDrift * 100).toFixed(1)}% of ${shipped.before.scrollHeight}px, ` +
          `the page's own lazy growth ${(ownDrift * 100).toFixed(1)}%, budget ${(DRIFT_BUDGET * 100).toFixed(0)}%)`,
      )

      const after = shipped.after
      const empty = after.sections.filter(s => s.children > 0 && s.height === 0)
      check(empty.length === 0, `${key}: ${empty.length} section(s) rendered to zero height after being scrolled to`)

      /* Paint containment clips, so a section that gained the treatment and
       * has content wider than its box would lose the overhang. Judged only
       * where the treatment applies and only where the section does not
       * already clip itself: a band that declares `overflow-hidden` and
       * paints a decorative bleed past its edge is doing that on purpose,
       * with or without this change. 2px of slack for sub-pixel rounding. */
      const candidates = after.sections.filter(s => s.contentVisibility === 'auto' && s.overflowX === 'visible')
      const clipped = candidates.filter(s => s.scrollWidth > s.clientWidth + 2)
      check(
        clipped.length === 0,
        `${key}: ${clipped.length} of ${candidates.length} treated section(s) have content wider than their box` +
          (clipped.length ? ` (first: section ${clipped[0].i}, ${clipped[0].scrollWidth} > ${clipped[0].clientWidth})` : ''),
      )

      const withHeadings = after.sections.filter(s => s.headings > 0).length
      notes.push(
        `${key}: ${after.sections.length} sections, ${withHeadings} with headings, ${engaged} skipping, ` +
          `heights ${shipped.before.scrollHeight} -> ${after.scrollHeight}px`,
      )

      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')
        await shipped.page.evaluate('window.scrollTo(0, 0)')
        await shipped.page.waitForTimeout(300)
        await shipped.page.screenshot({ path: `${SHOTS}/${slug}-${vp.label}-top.png`, fullPage: false })
        await shipped.page.screenshot({ path: `${SHOTS}/${slug}-${vp.label}-full.png`, fullPage: true })
      }
      await shipped.context.close()
      await control.context.close()
    }
  }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

for (const n of notes) console.log(`${TAG} note: ${n}`)
if (faults.length) {
  console.error(`${TAG} FAIL - ${faults.length} fault(s)`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${PATHS.length} path(s), ${VIEWPORTS.length} viewport(s), 0 faults`)
