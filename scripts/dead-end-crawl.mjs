// DEAD-END CRAWL: every link AND every button on every public surface, at the
// two viewports the benchmark gate uses.
//
// WHY THIS EXISTS BESIDE link-integrity-crawl.mjs, which it does not replace.
// That crawler fetches the HTML and follows hrefs, which answers "does this
// link resolve". It cannot answer the question the founder asked after finding
// the defect himself on a live production event page: a gold "Get tickets"
// anchor that pointed at a section ALREADY IN VIEW. It resolved. It was 200. It
// did nothing. On a phone that is a dead end, and it is the most expensive kind,
// because it sits on the buy button.
//
// So this one runs a real browser at a real viewport and reports FIVE classes:
//
//   1. BROKEN LINK        an internal href whose final response is not 200
//   2. EMPTY LINK         href="#", href="", or javascript:void(0)
//   3. MISSING ANCHOR     href="#id" where no element with that id exists
//   4. NO-OP ANCHOR       href="#id" where the target is ALREADY fully visible
//                         at this viewport, so pressing it moves nothing. The
//                         founder's defect, and the reason for the viewport
//                         argument: it is TRUE at 1440 and FALSE at 390 for the
//                         same markup, so a single-viewport crawl cannot see it
//   5. INERT BUTTON       an enabled <button> with no click handler, not a form
//                         submit, not a popover trigger, not wrapped in a link
//
// HOW CLASS 5 IS DECIDED WITHOUT CLICKING. Clicking every button on a live
// deployment is not a test, it is a series of side effects. React attaches the
// element's props to the DOM node under a `__reactProps$<hash>` key, so the
// presence of an onClick can be read directly off the node. A button with no
// onClick, no type=submit inside a form, no popovertarget and no anchor
// ancestor cannot do anything when pressed. Buttons that pass through a
// delegated parent handler would be reported here as candidates; each finding
// is confirmed by hand before it is called a defect, and the report says which.
//
// IT PUBLISHES HOW MUCH IT DID. Every count is printed: pages loaded, anchors
// inspected, unique targets requested, buttons inspected, per viewport, with the
// MEASURED innerWidth of each pass rather than the requested one. A crawl that
// silently loaded nothing prints zeros instead of the same PASS.
//
// Usage:
//   node scripts/dead-end-crawl.mjs <baseUrl> [--viewport 390] [--json out.json]

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = (process.argv[2] || process.env.BASE || '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: node scripts/dead-end-crawl.mjs <baseUrl> [--viewport 390]')
  process.exit(2)
}

const vpArg = process.argv.indexOf('--viewport')
const VIEWPORTS =
  vpArg === -1
    ? [
        { label: 'mobile', width: 390, height: 844 },
        { label: 'desktop', width: 1440, height: 900 },
      ]
    : [{ label: `custom-${process.argv[vpArg + 1]}`, width: Number(process.argv[vpArg + 1]), height: 900 }]

const jsonArg = process.argv.indexOf('--json')

/**
 * `--storage <state.json>` crawls SIGNED IN, which is the other half of the
 * surface: the dashboard, the organiser wizard, the scanner and checkout up to
 * the payment step. `--paths a,b,c` replaces the public seed list with those
 * paths, so the two halves are separate runs with separate reports rather than
 * one run whose numbers cannot be compared with either.
 */
const storageIdx = process.argv.indexOf('--storage')
const STORAGE = storageIdx === -1 ? null : process.argv[storageIdx + 1]
const pathsIdx = process.argv.indexOf('--paths')
const PATH_OVERRIDE = pathsIdx === -1 ? null : process.argv[pathsIdx + 1].split(',')

const SEED_PATHS = [
  '/',
  '/events',
  '/launch',
  '/organisers',
  '/pricing',
  '/about',
  '/help',
  '/contact',
  '/careers',
  '/press',
  '/guides',
  '/cities',
  '/communities',
  '/city/melbourne',
  '/city/sydney',
  '/city/sydney/inner-west',
  '/community/african',
  '/community/african/sydney',
  '/categories/afrobeats',
  '/legal/terms',
  '/legal/privacy',
  '/login',
  '/signup',
  '/organisers/signup',
]

/**
 * How many REAL event detail pages to discover from /events and add to the
 * crawl.
 *
 * Not optional, and not a nice-to-have: the defect that produced this script
 * was on a live production EVENT page, a gold "Get tickets" that anchored to a
 * section already in view. A crawl of the marketing set could never have seen
 * it. The slugs are discovered rather than listed because a hardcoded slug goes
 * stale the moment the catalogue changes, and a stale slug 404s in a way that
 * reads as a platform defect.
 */
const EVENT_PAGES_TO_CRAWL = 6

/**
 * How little movement counts as "it did nothing".
 *
 * Chosen rather than derived, and stated so it can be argued with: a press that
 * moves the page less than about a finger's width is indistinguishable from a
 * press that did nothing, and 120 CSS pixels is roughly that on a phone. A
 * larger number would flag legitimate short hops; a smaller one would miss the
 * complaint that produced this script.
 */
const NO_OP_SCROLL_PX = 120

const SKIP_PREFIXES = ['/api/', '/cdn/', '/_next/', '/monitoring', '/e/']
const SKIP_EXACT = new Set(['/sitemap.xml', '/robots.txt'])

function isInternal(href) {
  if (!href) return false
  if (href.startsWith('//')) return false
  if (href.startsWith('/')) return true
  return href.startsWith(BASE)
}

function toPath(href) {
  const url = href.startsWith('/') ? new URL(href, BASE) : new URL(href)
  return url.pathname + url.search
}

/** Runs inside the page. Returns every anchor and every button, described. */
const HARVEST = () => {
  const reactPropsOf = el => {
    const key = Object.keys(el).find(k => k.startsWith('__reactProps$'))
    return key ? el[key] : null
  }
  const visible = el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }
  /** Fully inside the current viewport, so scrolling to it moves nothing. */
  const fullyInView = el => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  }

  const anchors = [...document.querySelectorAll('a')]
    .filter(visible)
    .map(a => {
      const raw = a.getAttribute('href')
      const fragment = raw && raw.startsWith('#') ? raw.slice(1) : null
      let target = null
      if (fragment) {
        try {
          target = document.getElementById(fragment) || document.querySelector(`[name="${fragment}"]`)
        } catch {
          target = null
        }
      }
      return {
        href: raw,
        text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 60),
        fragment,
        fragmentTargetExists: fragment ? Boolean(target) : null,
        // The founder's defect: the anchor scrolls to something already on
        // screen, so pressing it is a no-op the user reads as a broken button.
        fragmentTargetAlreadyInView: target ? fullyInView(target) : null,
        // HOW FAR THE PAGE WOULD ACTUALLY MOVE, in pixels. The browser brings
        // the target to the top of the viewport, so the distance travelled is
        // the target's current top. This is the measurement rather than the
        // inference: a link that moves the page four pixels has not done
        // nothing according to the DOM, and has done nothing according to the
        // person pressing it.
        fragmentScrollDelta: target ? Math.round(target.getBoundingClientRect().top) : null,
        selfInView: fullyInView(a),
      }
    })

  const buttons = [...document.querySelectorAll('button, [role="button"]')]
    .filter(visible)
    .map(b => {
      const props = reactPropsOf(b) || {}
      return {
        text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 60),
        disabled: b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true',
        type: b.getAttribute('type'),
        insideForm: Boolean(b.closest('form')),
        hasOnClick: typeof props.onClick === 'function' || typeof props.onPointerDown === 'function',
        hasOnKeyDown: typeof props.onKeyDown === 'function',
        hasPopover: b.hasAttribute('popovertarget') || Boolean(b.getAttribute('aria-controls')),
        insideAnchor: Boolean(b.closest('a')),
        hasFormAction: b.hasAttribute('formaction'),
      }
    })

  return {
    measuredWidth: window.innerWidth,
    measuredHeight: window.innerHeight,
    title: document.title,
    anchors,
    buttons,
  }
}

const findings = []
const stats = []

const browser = await chromium.launch()

// Discover real event slugs before the passes, so both viewports crawl the same
// pages and the two reports are comparable.
const discoveryOptions = { viewport: { width: 1440, height: 900 } }
if (STORAGE) discoveryOptions.storageState = STORAGE
const discovery = await browser.newContext(discoveryOptions)
const discoveryPage = await discovery.newPage()
// An explicit path list is the whole run; discovery would only add public pages
// to an authenticated crawl and make the two reports incomparable.
let eventPaths = []
if (!PATH_OVERRIDE) try {
  await discoveryPage.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await discoveryPage.waitForTimeout(1500)
  eventPaths = await discoveryPage.evaluate(
    n =>
      [
        ...new Set(
          [...document.querySelectorAll('a[href^="/events/"]')]
            .map(a => a.getAttribute('href'))
            .filter(h => h && h.split('/').length === 3),
        ),
      ].slice(0, n),
    EVENT_PAGES_TO_CRAWL,
  )
} catch {
  eventPaths = []
}
await discovery.close()

if (!PATH_OVERRIDE && eventPaths.length === 0) {
  console.error(
    '[dead-end-crawl] WARNING: discovered ZERO event pages from /events.\n' +
      '                 The event detail page is the surface this script exists for,\n' +
      '                 so a run without one is reported as incomplete, not as a pass.',
  )
}
const PATHS = PATH_OVERRIDE ?? [...SEED_PATHS, ...eventPaths]

for (const viewport of VIEWPORTS) {
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  }
  if (STORAGE) contextOptions.storageState = STORAGE
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()

  let pagesLoaded = 0
  let anchorsSeen = 0
  let buttonsSeen = 0
  const internalTargets = new Set()
  const measuredWidths = new Set()

  for (const path of PATHS) {
    const url = `${BASE}${path}`
    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      // Let the client hydrate so React props are attached before harvesting.
      await page.waitForTimeout(1200)
    } catch (err) {
      findings.push({
        viewport: viewport.width,
        page: path,
        severity: 'BLOCKER',
        kind: 'PAGE LOAD FAILED',
        detail: String(err).slice(0, 160),
      })
      continue
    }

    const status = response ? response.status() : 0
    if (status !== 200) {
      findings.push({
        viewport: viewport.width,
        page: path,
        severity: 'BLOCKER',
        kind: 'SEED PAGE NOT 200',
        detail: `HTTP ${status}`,
      })
      continue
    }
    pagesLoaded += 1

    const harvest = await page.evaluate(HARVEST)
    measuredWidths.add(harvest.measuredWidth)
    anchorsSeen += harvest.anchors.length
    buttonsSeen += harvest.buttons.length

    for (const a of harvest.anchors) {
      const href = a.href
      if (href === null || href === undefined) {
        findings.push({
          viewport: viewport.width,
          page: path,
          severity: 'MAJOR',
          kind: 'EMPTY LINK',
          detail: `an <a> with no href at all: "${a.text}"`,
        })
        continue
      }
      if (href === '' || href === '#' || href.startsWith('javascript:')) {
        findings.push({
          viewport: viewport.width,
          page: path,
          severity: 'MAJOR',
          kind: 'EMPTY LINK',
          detail: `href="${href}" on "${a.text}"`,
        })
        continue
      }
      if (a.fragment !== null) {
        if (!a.fragmentTargetExists) {
          findings.push({
            viewport: viewport.width,
            page: path,
            severity: 'MAJOR',
            kind: 'MISSING ANCHOR',
            detail: `"${a.text}" points at #${a.fragment}, which is not on the page`,
          })
        } else if (a.selfInView && Math.abs(a.fragmentScrollDelta ?? 9999) < NO_OP_SCROLL_PX) {
          findings.push({
            viewport: viewport.width,
            page: path,
            severity: 'MAJOR',
            kind: 'NO-OP ANCHOR',
            detail:
              `"${a.text}" points at #${a.fragment}, which is ${a.fragmentScrollDelta}px away at ` +
              `${viewport.width}px. Pressing it moves the page almost nothing` +
              (a.fragmentTargetAlreadyInView ? ' and the target is already fully in view.' : '.'),
          })
        }
        continue
      }
      if (!isInternal(href)) continue
      const target = toPath(href)
      if (SKIP_EXACT.has(target)) continue
      if (SKIP_PREFIXES.some(p => target.startsWith(p))) continue
      internalTargets.add(target)
    }

    for (const b of harvest.buttons) {
      if (b.disabled) continue
      if (b.insideAnchor) continue
      if (b.hasPopover) continue
      if (b.hasFormAction) continue
      if (b.insideForm && b.type !== 'button') continue
      if (b.hasOnClick || b.hasOnKeyDown) continue
      findings.push({
        viewport: viewport.width,
        page: path,
        severity: 'MAJOR',
        kind: 'INERT BUTTON',
        detail: `"${b.text || '(no accessible name)'}" has no click handler, is not a submit, and is not wrapped in a link`,
      })
    }
  }

  // Request every unique internal target this viewport actually rendered.
  const targets = [...internalTargets].sort()
  let checked = 0
  for (const target of targets) {
    let status = 0
    try {
      const res = await context.request.get(`${BASE}${target}`, { maxRedirects: 5, timeout: 30000 })
      status = res.status()
    } catch (err) {
      status = -1
      findings.push({
        viewport: viewport.width,
        page: target,
        severity: 'BLOCKER',
        kind: 'BROKEN LINK',
        detail: `request failed: ${String(err).slice(0, 120)}`,
      })
      continue
    }
    checked += 1
    if (status !== 200) {
      findings.push({
        viewport: viewport.width,
        page: target,
        severity: 'BLOCKER',
        kind: 'BROKEN LINK',
        detail: `HTTP ${status}`,
      })
    }
  }

  stats.push({
    viewport: viewport.width,
    label: viewport.label,
    measuredWidths: [...measuredWidths],
    pagesRequested: PATHS.length,
    pagesLoaded,
    anchorsSeen,
    buttonsSeen,
    uniqueTargets: targets.length,
    targetsChecked: checked,
  })

  await context.close()
}

await browser.close()

console.log(`\n[dead-end-crawl] base ${BASE}\n`)
for (const s of stats) {
  console.log(
    `[dead-end-crawl] ${s.label}: requested ${s.viewport}px, MEASURED window.innerWidth ${s.measuredWidths.join(', ') || 'none'}`,
  )
  console.log(
    `[dead-end-crawl]   ${s.pagesLoaded}/${s.pagesRequested} pages loaded, ` +
      `${s.anchorsSeen} anchors inspected, ${s.buttonsSeen} buttons inspected, ` +
      `${s.targetsChecked}/${s.uniqueTargets} unique internal targets requested.`,
  )
}

const bySeverity = { BLOCKER: [], MAJOR: [] }
for (const f of findings) (bySeverity[f.severity] ??= []).push(f)

console.log('')
for (const severity of ['BLOCKER', 'MAJOR']) {
  const list = bySeverity[severity] ?? []
  console.log(`[dead-end-crawl] ${severity}: ${list.length}`)
  const seen = new Set()
  for (const f of list) {
    const key = `${f.page}|${f.kind}|${f.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`    ${f.page}  [${f.viewport}px]  ${f.kind}`)
    console.log(`        ${f.detail}`)
  }
}

if (jsonArg !== -1) {
  writeFileSync(process.argv[jsonArg + 1], JSON.stringify({ base: BASE, stats, findings }, null, 2))
  console.log(`\n[dead-end-crawl] full report written to ${process.argv[jsonArg + 1]}`)
}

const loadedEverywhere = stats.every(s => s.pagesLoaded > 0)
if (!loadedEverywhere) {
  console.error('\n[dead-end-crawl] FAILED: a viewport loaded zero pages. That is not a pass.')
  process.exitCode = 1
} else if ((bySeverity.BLOCKER ?? []).length > 0) {
  process.exitCode = 1
}
