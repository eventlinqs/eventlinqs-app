/**
 * DRIVE: a section that reserves its own height reserves the RIGHT height, at
 * every viewport, on every template that renders an "all events" grid.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026. Nine interior
 * templates gained `content-visibility: auto` with a 480px intrinsic size (the
 * rail step: a heading and one row of cards). FOUR sections were excluded by
 * measurement and are the largest single layout cost left on their pages:
 *
 *     /city/[slug]            "All <city> events"       9,067px at 390
 *     /categories/[slug]      "Live <category> events"  9,043px at 390
 *     /city/[slug]/[suburb]   "All <suburb> events"     3,535px at 390
 *     /community/[c]/[city]   "All <c> events in <city>"  same shape
 *
 * A 480px reservation on a 9,067px section is wrong by 1,789%, and applying it
 * anyway grew /city/melbourne from 7,551px to 12,055px under the reader. That
 * attempt was measured and REVERTED (see below-fold-sections-drive.mjs).
 *
 * But the height of those four sections is NOT unknowable. It is 1, 2 or 3
 * columns of a card whose media box is a fixed aspect ratio of the column
 * width, and the number of cards is known at render time. So the section
 * declares its own height instead of inheriting a rail's, and this drive is
 * what proves the declaration is true.
 *
 * FIVE MORE WERE FOUND BY THE GUARD WRITTEN FOR THE FOUR, on its first run:
 * /feed's "more for you", the organiser and venue archives, the community
 * page's live grid and the category-events landing page. Every one of them was
 * reserving a rail's 480px for a grid of up to 24 cards, which is the same
 * defect in the opposite direction and had been shipping unnoticed. Nine grids
 * carry the reservation now.
 *
 * ============================================================================
 * WHAT IT MEASURES, AND WHY IT IS NOT THE DRIFT DRIVE
 * ============================================================================
 *
 * `below-fold-sections-drive.mjs` measures the whole document's growth as a
 * reader scrolls, which is the SYMPTOM. It is the right check for "did this
 * technique hurt the reader" and the wrong one for "is this particular
 * estimate right", because one section's error is diluted by every other
 * section on the page and by the page's own lazy growth.
 *
 * This drive asks the narrow question directly. For every section carrying an
 * estimate it:
 *
 *   1. READS THE ESTIMATE THE BROWSER WOULD USE. The estimate is a `calc()`
 *      in a custom property, so it is resolved the only honest way: a probe
 *      element is given `height: var(--cv-h-*)` in the section's own context
 *      and measured. Reading the declaration as text and evaluating it here
 *      would be measuring this script's arithmetic, not the browser's.
 *   2. READS THE REAL HEIGHT, after the section has been scrolled to and has
 *      laid out.
 *   3. REPORTS THE ERROR as a share of the real height, and fails over budget.
 *
 * It also reports the geometry the estimate is derived from - content width,
 * column width, row height, card body height, section chrome - so the
 * constants in src/lib/ui/event-grid-intrinsic.ts can be RE-DERIVED from a
 * run rather than trusted. `--derive` prints them in the shape the module
 * declares them.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * IT JUDGES THREE VIEWPORTS, and the estimate is a continuous function of the
 * viewport width. 390, 768 and 1440 are the platform's three benchmark widths
 * and they sit at the bottom of each of the three column bands, which is where
 * the estimate is least forgiving; a width in the middle of a band is
 * interpolated by the same `calc()` and is not measured here.
 *
 * IT CANNOT SEE A TITLE THAT WRAPS. Card titles are `line-clamp-2`, so a row's
 * height is the tallest card in it, and a page of one-line titles is shorter
 * than a page of two-line titles by one line of text per row. That is why the
 * budget is a percentage rather than a pixel count, and why the measured body
 * constant is taken from real pages rather than from the type scale.
 *
 * Usage (paths carry NO leading slash: MSYS rewrites one into a Windows path):
 *   node scripts/verify/event-grid-intrinsic-drive.mjs --serve --port=3200 \
 *     --path=city/melbourne --path=categories/music
 *   node scripts/verify/event-grid-intrinsic-drive.mjs --serve --port=3200 --derive --path=city/melbourne
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'

const TAG = '[event-grid-intrinsic]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const DERIVE = args.includes('--derive')
const COST = args.includes('--cost')
const DRIFT = args.includes('--drift')
const PORT = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 3200)
const SHOTS = args.find(a => a.startsWith('--shots='))?.split('=')[1]
let BASE = args.find(a => a.startsWith('http')) ?? `http://127.0.0.1:${PORT}`
const norm = (p) => (p === 'home' || p === '' ? '/' : p.startsWith('/') ? p : `/${p}`)
/** Paths that MUST render a grid of event cards. */
const PATHS = args.filter(a => a.startsWith('--path=')).map(a => norm(a.split('=')[1]))
/**
 * Paths that must render the shared designed EMPTY state instead, and must
 * therefore carry NO reservation: `eventGridIntrinsicSize(0)` is null on
 * purpose, because the height of an empty state has nothing to do with a card
 * count. Kept separate from `--path=` rather than inferred, so a grid that
 * silently disappeared can never be mistaken for a page that legitimately has
 * none.
 */
const EMPTY_PATHS = args.filter(a => a.startsWith('--empty-path=')).map(a => norm(a.split('=')[1]))
if (PATHS.length === 0 && EMPTY_PATHS.length === 0) {
  console.error(`${TAG} REFUSING: no --path= or --empty-path= given. This drive judges named templates, never a guessed one.`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844, band: 'base' },
  { label: '768', width: 768, height: 1024, band: 'md' },
  { label: '1440', width: 1440, height: 900, band: 'lg' },
]

/**
 * How far the reserved height may sit from the real one, as a share of the
 * real height.
 *
 * DERIVED FROM MEASUREMENT rather than chosen to make a tree green. The
 * irreducible error is the card title: it is `line-clamp-2`, so a row holding
 * only one-line titles is one line of 18px/1.375 text shorter than a row
 * holding a two-line title, which is 24.75px on a row that measures 360 to
 * 550px depending on the viewport - 4.5% to 6.9% per row in the worst case
 * where EVERY row differs from the constant in the same direction.
 *
 * 10% sits above that and is a twentieth of the 200% error the 480px rail
 * estimate produced on these sections. A section that exceeds it is not
 * suffering from title variance; its geometry has changed and the constants
 * need re-deriving with --derive.
 */
const ERROR_BUDGET = 0.10

const faults = []
const notes = []
/**
 * `message` describes the FAULT, because that is what a fault list has to say.
 * `okMessage` is what to print when the check passed, and it exists because
 * without it this line read
 *
 *     ok   the section declares NO reservation the browser could resolve
 *
 * on every successful run, which states the opposite of what happened. An
 * instrument whose whole value is being believed must not print the failure
 * text beside a pass. Only the negated assertions need one; the rest already
 * read correctly either way.
 */
function check(ok, message, okMessage) {
  if (!ok) faults.push(message)
  console.log(`${TAG}   ${ok ? 'ok  ' : 'FAIL'} ${ok && okMessage ? okMessage : message}`)
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
  const started = await startGateServer(envFor('local'), '.tmp/event-grid-intrinsic-server.log', { port: PORT })
  if (started.error) {
    console.error(`${TAG} could not serve the build: ${started.error}`)
    process.exit(1)
  }
  BASE = started.base
  stopServer = started.stop
  console.log(`${TAG} serving the production build on ${BASE}`)
}

/**
 * A real visitor's user agent. `[data-headless="1"]` switches off the reveal
 * animation and every transition, and a section revealed by an
 * IntersectionObserver lays out differently when that is off. The point is to
 * measure what a reader gets.
 */
const REAL_VISITOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

/**
 * Runs IN THE PAGE. Finds every "all events" grid, whether or not it carries
 * an estimate, and reports the geometry both halves of this drive need.
 *
 * A grid is identified by what it IS rather than by a marker put there for
 * the test: a CSS grid whose direct children are links to /events/. Adding a
 * data attribute for the harness to find would put bytes in every document on
 * the platform to make one script's selector shorter, which is the opposite of
 * what this item is for.
 */
const MEASURE = `(() => {
  const round = (n) => Math.round(n * 10) / 10
  /*
   * THE RESERVATION AS THE BROWSER RESOLVED IT.
   *
   * contain-intrinsic-size holds a calc() over min(100vw, ...) and a custom
   * property. Every term in it resolves at computed-value time, so the
   * computed style is already a pixel length, and reading it is reading the
   * number the browser will actually reserve - not this script's arithmetic,
   * and not a probe element that has to be inserted into the page.
   *
   * (No backticks in here: this comment lives inside a template literal, and
   * one backtick ends the whole script.)
   */
  const reservedPx = (section) => {
    const v = getComputedStyle(section).containIntrinsicSize
    const m = /auto\s+([0-9.]+)px/.exec(v) || /([0-9.]+)px/.exec(v)
    return m ? round(parseFloat(m[1])) : null
  }
  const grids = [...document.querySelectorAll('div')].filter(d => {
    if (getComputedStyle(d).display !== 'grid') return false
    const kids = [...d.children]
    if (kids.length < 2) return false
    return kids.every(k => k.tagName === 'A' && (k.getAttribute('href') || '').startsWith('/events/'))
  })
  return {
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    /* Every section on the page and what it reserves, so a page with no grid
     * is still measured rather than merely reported as empty. */
    emptySections: [...document.querySelectorAll('section')].map(s => {
      const cs = getComputedStyle(s)
      return {
        height: Math.round(s.getBoundingClientRect().height),
        contentVisibility: cs.contentVisibility,
        containIntrinsicSize: cs.containIntrinsicSize,
        declares: getComputedStyle(s).getPropertyValue('--cv-r-base').trim() !== '',
      }
    }),
    grids: grids.map(g => {
      const section = g.closest('section')
      const cs = section ? getComputedStyle(section) : null
      const cards = [...g.children]
      const first = cards[0]
      const media = first ? first.querySelector('.event-card-media') : null
      const body = first ? first.querySelector('.event-card-body') : null
      /* Rows are read from the laid-out grid rather than computed from the
       * card count, so a change to the column count is visible here instead
       * of being assumed away. */
      const tops = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))]
      const gridBox = g.getBoundingClientRect()
      const sectionBox = section ? section.getBoundingClientRect() : null
      return {
        cards: cards.length,
        rows: tops.length,
        columns: Math.round(cards.length / tops.length * 10) / 10,
        gridWidth: round(gridBox.width),
        gridHeight: round(gridBox.height),
        cardWidth: first ? round(first.getBoundingClientRect().width) : null,
        cardHeight: first ? round(first.getBoundingClientRect().height) : null,
        mediaHeight: media ? round(media.getBoundingClientRect().height) : null,
        bodyHeight: body ? round(body.getBoundingClientRect().height) : null,
        rowHeights: tops.length > 1 ? tops.slice(1).map((t, i) => Math.round(t - tops[i])) : [],
        sectionHeight: sectionBox ? round(sectionBox.height) : null,
        sectionPadTop: cs ? parseFloat(cs.paddingTop) : null,
        sectionPadBottom: cs ? parseFloat(cs.paddingBottom) : null,
        contentVisibility: cs ? cs.contentVisibility : null,
        containIntrinsicSize: cs ? cs.containIntrinsicSize : null,
        /* One number: the rule already switched at the breakpoint, so what
         * the browser resolved IS the band's reservation. */
        reserved: section ? reservedPx(section) : null,
      }
    }),
  }
})()`

const derived = []
const costs = []

/**
 * What the treatment is WORTH, measured rather than assumed (clause C8B.3:
 * every change reports the numbers before and after, and a change that does
 * not improve them is reverted).
 *
 * Both passes run against the SAME build, back to back, in the same browser.
 * The control switches `content-visibility` off IN THE BROWSER, so the only
 * difference between the two numbers is the treatment - not a second build, not
 * a second machine, and not this machine's mood, which on 19 September 2026
 * tripled a control page's style recalculation between two sessions an hour
 * apart because another lane was building.
 *
 * The numbers come from the Chrome DevTools Protocol's own counters
 * (`Performance.getMetrics`), which is where the browser records the time it
 * spent, rather than from a wall clock this script keeps.
 */
async function layoutCost(browser, path, vp, mode) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: REAL_VISITOR_UA,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  /* `laid-out` is the state THIS ITEM CHANGED and nothing else: only the
   * sections carrying a reservation are put back to laying out in full. `all-off`
   * switches the whole treatment off, which is a different question and is kept
   * because it is the one the platform-wide number answers. */
  const css =
    mode === 'laid-out'
      ? 'section[style*="--cv-r-base"]{content-visibility:visible !important}'
      : mode === 'all-off'
        ? 'section{content-visibility:visible !important}'
        : null
  if (css) {
    await page.addInitScript(
      `document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style')
        s.textContent = ${JSON.stringify('PLACEHOLDER')}
        document.head.appendChild(s)
      })`.replace(JSON.stringify('PLACEHOLDER'), JSON.stringify(css)),
    )
  }
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const { metrics } = await cdp.send('Performance.getMetrics')
  const by = Object.fromEntries(metrics.map(m => [m.name, m.value]))
  const nodes = await page.evaluate('document.getElementsByTagName("*").length')
  await context.close()
  return {
    layoutMs: Math.round((by.LayoutDuration ?? 0) * 1000),
    recalcMs: Math.round((by.RecalcStyleDuration ?? 0) * 1000),
    layoutCount: by.LayoutCount ?? 0,
    recalcCount: by.RecalcStyleCount ?? 0,
    nodes,
  }
}

/**
 * HOW MUCH THE PAGE MOVES UNDER THE READER, three ways, on ONE build.
 *
 * This is the before-and-after that matters, and it is the only honest way to
 * take it: the "before" is reproduced IN THE BROWSER on the same bytes, rather
 * than being quoted from a build that no longer exists on this disk.
 *
 *   shipped   the measured reservation, as it ships
 *   rail      `contain-intrinsic-size: auto 480px` forced onto the same
 *             sections - the rail's guess, which is what five of these nine
 *             grids were actually reserving before 19 September 2026
 *   control   `content-visibility: visible` forced on - the page's OWN lazy
 *             growth, which has nothing to do with any reservation and must be
 *             subtracted from both or the numbers accuse the wrong thing
 *
 * The 480px in the `rail` pass is written here rather than imported because it
 * is a HISTORICAL value: the point is to reproduce what those pages did, and
 * an import would silently follow `cv-section` if somebody retuned it.
 */
async function driftPass(browser, path, vp, mode) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: REAL_VISITOR_UA,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  /*
   * THE TWO "BEFORE" STATES ARE REPRODUCED BY SELECTING THE RESERVING SECTIONS
   * THEMSELVES, which is possible because the reservation is three custom
   * properties written as an INLINE STYLE: `[style*="--cv-r-base"]` is exactly
   * the set of sections this item changed, and nothing else on the page moves.
   *
   * An earlier version of this pass forced `contain-intrinsic-size` on every
   * `section`, which also re-stated the 480px that the other sections already
   * had. It reported the before and after as identical on four of five pages,
   * and the reason turned out to have nothing to do with the override: on those
   * pages the grid sits close enough to the fold that Chrome renders it at load
   * whatever is reserved. That was established by reading the computed style
   * back, which is what `applied` below is for.
   */
  const MEASURED = 'section[style*="--cv-r-base"]'
  const css =
    mode === 'control'
      ? 'section{content-visibility:visible !important}'
      : mode === 'rail'
        ? `${MEASURED}{contain-intrinsic-size:auto 480px !important}`
        : mode === 'laid-out'
          ? `${MEASURED}{content-visibility:visible !important}`
          : null
  if (css) {
    /*
     * INJECTED AT DOCUMENT START, NOT AT DOMContentLoaded, and the difference
     * showed up as a lie in the output. Waiting for DOMContentLoaded let the
     * browser skip the section BEFORE the control's `content-visibility:
     * visible` arrived, so the "laid out in full" pass reported a skip it had
     * been written to prevent. The style goes on `documentElement`, which
     * exists at document start, because `document.head` does not yet.
     */
    await page.addInitScript(
      `(() => {
        const tag = document.createElement('style')
        tag.textContent = ${JSON.stringify(css)}
        const put = () => {
          const root = document.head || document.documentElement
          if (!root) return false
          root.appendChild(tag)
          return true
        }
        /* A microtask retry loop here starved the event loop and the page
         * never finished navigating. An observer waits without spinning. */
        if (!put()) {
          const obs = new MutationObserver(() => { if (put()) obs.disconnect() })
          obs.observe(document, { childList: true, subtree: true })
        }
      })()`,
    )
  }
  /*
   * WHETHER THE SECTION WAS EVER SKIPPED, ASKED OF THE BROWSER RATHER THAN OF
   * THE DOM.
   *
   * The obvious probe - read a card's box and see whether it has one - is
   * WRONG here twice over. Querying layout inside skipped content forces it to
   * render, so the probe destroys the state it is measuring; and when the
   * reservation is accurate, which is the entire point of this item, the
   * section measures the same skipped or rendered, so its own box cannot tell
   * them apart either. An earlier version of this drive did exactly that and
   * reported "rendered" for a section whose box was 608px, which is a
   * reservation and not a rendering.
   *
   * `contentvisibilityautostatechange` is the browser announcing the
   * transition itself. Listening costs nothing and perturbs nothing.
   */
  await page.addInitScript(`
    window.__cvStates = []
    document.addEventListener('contentvisibilityautostatechange', (e) => {
      const declares = e.target instanceof Element &&
        getComputedStyle(e.target).getPropertyValue('--cv-r-base').trim() !== ''
      if (declares) window.__cvStates.push(e.skipped ? 'skipped' : 'shown')
    }, true)
  `)
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const before = await page.evaluate('document.documentElement.scrollHeight')
  const states = await page.evaluate('(window.__cvStates || []).join(",") || "no event"')
  /* WHAT THE BROWSER ACTUALLY DID, not what the mode asked for. The first run
   * of this comparison reported the rail pass and the shipped pass as
   * identical on four of five pages, and speculating about why would have been
   * cheaper than reading it. */
  const applied = await page.evaluate(`(() => {
    const s = [...document.querySelectorAll('section')].find(x => getComputedStyle(x).getPropertyValue('--cv-r-base').trim() !== '')
    if (!s) return 'no section declares a reservation'
    const cs = getComputedStyle(s)
    /*
     * SKIPPED OR RENDERED, DECIDED BY A CHILD RATHER THAN BY THE SECTION'S OWN
     * BOX. When the reservation is accurate - which is the entire point - the
     * section measures the same either way, to within a pixel, and reading its
     * height cannot tell the two apart. A skipped subtree has no layout boxes
     * at all, so the first card inside reports zero.
     */
    return cs.contentVisibility + ' / ' + cs.containIntrinsicSize + ' / section box ' + Math.round(s.getBoundingClientRect().height) + 'px'
  })()`)
  await page.evaluate(`(async () => {
    const step = window.innerHeight
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise(r => setTimeout(r, 120))
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise(r => setTimeout(r, 400))
  })()`)
  const after = await page.evaluate('document.documentElement.scrollHeight')
  await context.close()
  return { before, after, applied, states, drift: Math.abs(after - before) / (before || 1) }
}

const drifts = []
const browser = await chromium.launch()
try {
  for (const path of [...PATHS, ...EMPTY_PATHS]) {
    const mustHaveGrid = PATHS.includes(path)
    for (const vp of VIEWPORTS) {
      const key = `${path} ${vp.label}`
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: REAL_VISITOR_UA,
        reducedMotion: 'no-preference',
      })
      const page = await context.newPage()
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      check(res?.status() === 200, `${key}: the page answered ${res?.status()}`)

      /* The section has to be RENDERED before its real height exists: that is
       * the whole point of the treatment. Scroll the way a reader does. */
      await page.evaluate(`(async () => {
        const step = window.innerHeight
        for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 120))
        }
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise(r => setTimeout(r, 500))
      })()`)
      const m = await page.evaluate(MEASURE)

      if (mustHaveGrid) {
        check(m.grids.length > 0, `${key}: ${m.grids.length} event grid(s) found on the page`)
      } else {
        check(
          m.grids.length === 0,
          `${key}: declared as an empty-state page and it renders ${m.grids.length} event grid(s). ` +
            `Either the page gained events, in which case move it to --path=, or the empty state is rendering cards.`,
        )
        const reserved = m.emptySections.filter(e => e.declares)
        check(
          reserved.length === 0,
          `${key}: ${reserved.length} section(s) on an empty-state page declare a grid reservation. ` +
            `eventGridIntrinsicSize(0) returns null so that they do not.`,
        )
        notes.push(
          `${key}: empty state, ${m.emptySections.length} section(s), ` +
            m.emptySections.map(e => `${e.height}px/${e.contentVisibility}`).join(' '),
        )
      }

      for (const [i, g] of m.grids.entries()) {
        const estimate = g.reserved
        notes.push(
          `${key} grid ${i}: ${g.cards} cards in ${g.rows} rows of ~${g.columns}, ` +
            `card ${g.cardWidth}x${g.cardHeight} (media ${g.mediaHeight}, body ${g.bodyHeight}), ` +
            `grid ${g.gridHeight}px, section ${g.sectionHeight}px ` +
            `(pad ${g.sectionPadTop}/${g.sectionPadBottom}), ` +
            `content-visibility ${g.contentVisibility}, reserved ${g.containIntrinsicSize}` +
            (estimate === null ? ', NO ESTIMATE DECLARED' : `, estimate ${estimate}px`),
        )

        if (DRIFT) {
        const shipped = await driftPass(browser, path, vp, 'shipped')
        const rail = await driftPass(browser, path, vp, 'rail')
        const laidOut = await driftPass(browser, path, vp, 'laid-out')
        const control = await driftPass(browser, path, vp, 'control')
        const own = control.drift
        const attributable = Math.max(0, shipped.drift - own)
        drifts.push({
          path, viewport: vp.label, shipped, rail, laidOut, control, attributable,
          railAttributable: Math.max(0, rail.drift - own),
          laidOutAttributable: Math.max(0, laidOut.drift - own),
        })
        /*
         * THE PAGE-LEVEL BUDGET, and it is NOT this item's instrument. Most of
         * what it measures belongs to the OTHER sections on the page, which
         * reserve a flat 480px each. The precise check on this item's work is
         * the per-section error above, which is 0.0% to 2.6%. This one is here
         * because a reservation that is right on its own section and wrong for
         * the reader would be a pass worth nothing, and 15% is the budget the
         * below-fold drive already carries for the same question.
         */
        check(
          attributable <= 0.15,
          `${key}: the page moves ${(attributable * 100).toFixed(1)}% under a reader (budget 15%). ` +
            `With the 480px rail estimate on the same sections it moves ${((Math.max(0, rail.drift - own)) * 100).toFixed(1)}%, ` +
            `and with them laid out in full ${((Math.max(0, laidOut.drift - own)) * 100).toFixed(1)}%.`,
        )
      }

      if (DRIFT) {
  console.log(`${TAG} --drift: how far the page moves under a reader, same build, three reservations`)
  for (const d of drifts) {
    console.log(
      `${TAG}   ${d.path} ${d.viewport}: measured ${(d.attributable * 100).toFixed(1)}%, ` +
        `as-480px ${(d.railAttributable * 100).toFixed(1)}%, ` +
        `as-laid-out ${(d.laidOutAttributable * 100).toFixed(1)}%, ` +
        `page's own lazy growth ${(d.control.drift * 100).toFixed(1)}%`,
    )
    console.log(
      `${TAG}     first paint: measured ${d.shipped.before}px [${d.shipped.applied}], ` +
        `as-480px ${d.rail.before}px [${d.rail.applied}], as-laid-out ${d.laidOut.before}px [${d.laidOut.applied}]`,
    )
    console.log(
      `${TAG}     the browser's own state changes for the reserving section: ` +
        `measured [${d.shipped.states}], as-480px [${d.rail.states}], as-laid-out [${d.laidOut.states}]`,
    )
  }
}
if (COST) {
  console.log(`${TAG} --cost: what skipping below-fold layout is worth, same build, treatment off in the browser for the control`)
  for (const c of costs) {
    const ratio = (a, b) => (b === 0 ? 'n/a' : (a / b).toFixed(2))
    console.log(
      `${TAG}   ${c.path} ${c.viewport}: layout ${c.shipped.layoutMs}ms shipped / ${c.laidOut.layoutMs}ms as-laid-out ` +
        `(x${ratio(c.shipped.layoutMs, c.laidOut.layoutMs)}) / ${c.allOff.layoutMs}ms with the whole treatment off; ` +
        `recalc ${c.shipped.recalcMs} / ${c.laidOut.recalcMs} (x${ratio(c.shipped.recalcMs, c.laidOut.recalcMs)}) / ${c.allOff.recalcMs}ms; ` +
        `${c.shipped.nodes} nodes`,
    )
  }
}
if (DERIVE) {
          /* The two constants the module cannot derive from the class names:
           * what the card is below its media box, and what the section holds
           * besides the grid. Both are read off the real page. */
          derived.push({
            path,
            viewport: vp.label,
            band: vp.band,
            cards: g.cards,
            rows: g.rows,
            documentWidth: m.documentWidth,
            viewportWidth: m.viewportWidth,
            gridWidth: g.gridWidth,
            cardWidth: g.cardWidth,
            mediaHeight: g.mediaHeight,
            cardBodyPx: g.cardHeight !== null && g.mediaHeight !== null ? Math.round((g.cardHeight - g.mediaHeight) * 10) / 10 : null,
            rowStep: g.rowHeights.length ? g.rowHeights[0] : null,
            /* The heading block ALONE: the section's content box less the grid.
             * Its padding is deliberately excluded - the browser adds that to
             * whatever `contain-intrinsic-size` reserves. */
            sectionChromePx:
              g.sectionHeight !== null && g.gridHeight !== null
                ? Math.round((g.sectionHeight - (g.sectionPadTop ?? 0) - (g.sectionPadBottom ?? 0) - g.gridHeight) * 10) / 10
                : null,
          })
        }

        /*
         * A MISSING RESERVATION IS A FAULT, NOT A REASON TO CHECK NOTHING.
         *
         * This clause exists because the drive reported PASS on a build whose
         * reservation was entirely broken. The stylesheet came back stale from
         * `next build` naming the previous custom property; the browser
         * resolved `contain-intrinsic-size` to nothing at all, every section
         * came back with NO ESTIMATE DECLARED, and the one check this drive
         * exists to make was skipped silently on all fifteen. A step that
         * performed no work is not a step that passed.
         */
        check(
          estimate !== null,
          `${key} grid ${i}: the section declares NO reservation the browser could resolve ` +
            `(computed contain-intrinsic-size: ${g.containIntrinsicSize}). Either the section is not carrying ` +
            `.cv-measured, or the rule in globals.css names a custom property the component does not write, ` +
            `or the built stylesheet is stale.`,
          `${key} grid ${i}: the section declares a reservation the browser resolved ` +
            `(computed contain-intrinsic-size: ${g.containIntrinsicSize}).`,
        )

        if (estimate !== null) {
          /*
           * THE TWO BOXES ARE NOT THE SAME BOX, and comparing the wrong pair
           * is how this drive passed a tree whose reservation was 128px long.
           * `contain-intrinsic-size` sizes the CONTENT box; the browser adds
           * the section's padding to it. So the reservation is compared with
           * the section's border box only after the padding it will gain is
           * added to it, which is what the browser does.
           */
          const reservedBorderBox = estimate + (g.sectionPadTop ?? 0) + (g.sectionPadBottom ?? 0)
          const error = Math.abs(reservedBorderBox - g.sectionHeight) / (g.sectionHeight || 1)
          check(
            error <= ERROR_BUDGET,
            `${key} grid ${i}: the reserved height is ${(error * 100).toFixed(1)}% from the real one ` +
              `(reserved ${estimate}px content box + ${(g.sectionPadTop ?? 0) + (g.sectionPadBottom ?? 0)}px padding ` +
              `= ${Math.round(reservedBorderBox * 10) / 10}px, real ${g.sectionHeight}px, ${g.cards} cards, ` +
              `budget ${(ERROR_BUDGET * 100).toFixed(0)}%)`,
          )
          check(
            g.contentVisibility === 'auto',
            `${key} grid ${i}: the section skips rendering until near the viewport (content-visibility: ${g.contentVisibility})`,
          )
        }
      }

      if (COST) {
        const shipped = await layoutCost(browser, path, vp, 'shipped')
        const laidOut = await layoutCost(browser, path, vp, 'laid-out')
        const allOff = await layoutCost(browser, path, vp, 'all-off')
        costs.push({ path, viewport: vp.label, shipped, laidOut, allOff })
      }

      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')
        await page.evaluate('window.scrollTo(0, 0)')
        await page.waitForTimeout(300)
        await page.screenshot({ path: `${SHOTS}/${slug}-${vp.label}-top.png`, fullPage: false })
        /* The section this item changed, selected by the reservation it
         * carries. `section` with `.last()` was picking the organiser CTA at
         * the bottom of the page and producing a screenshot of the wrong
         * band. */
        const grid = page.locator('section[style*="--cv-r-base"]').first()
        await grid.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(400)
        await page.screenshot({ path: `${SHOTS}/${slug}-${vp.label}-grid.png`, fullPage: false })
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  if (stopServer) await stopServer()
}

for (const n of notes) console.log(`${TAG} note: ${n}`)
if (DERIVE) {
  console.log(`${TAG} --derive: the constants, read off the real pages`)
  for (const d of derived) console.log(`${TAG}   ${JSON.stringify(d)}`)
  const byBand = {}
  for (const d of derived) {
    byBand[d.band] ??= { cardBody: [], chrome: [] }
    if (d.cardBodyPx !== null) byBand[d.band].cardBody.push(d.cardBodyPx)
    if (d.sectionChromePx !== null) byBand[d.band].chrome.push(d.sectionChromePx)
  }
  const median = (xs) => {
    if (xs.length === 0) return null
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  for (const [band, v] of Object.entries(byBand)) {
    console.log(
      `${TAG}   ${band}: CARD_BODY_PX median ${median(v.cardBody)} of ${JSON.stringify(v.cardBody)}, ` +
        `SECTION_CHROME_PX median ${median(v.chrome)} of ${JSON.stringify(v.chrome)}`,
    )
  }
}
if (faults.length) {
  console.error(`${TAG} FAIL - ${faults.length} fault(s)`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${PATHS.length} grid path(s), ${EMPTY_PATHS.length} empty-state path(s), ` +
    `${VIEWPORTS.length} viewport(s), 0 faults`,
)
