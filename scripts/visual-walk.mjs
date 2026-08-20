// VISUAL WALK: screenshot every surface at 390 and 1440, and MEASURE the things
// a design review argues about, so a finding is a number rather than an opinion.
//
// WHY MEASUREMENT AND NOT ONLY SCREENSHOTS. "The footer looks jammed" is not
// actionable and cannot be compared before and after. "The gap between the last
// content element and the footer is 0px on this page and 96px on that one" is
// both. Every screenshot is still captured and looked at; the numbers are what
// make the walk repeatable and what prove a fix landed.
//
// WHAT IT MEASURES, per surface per viewport:
//   - the MEASURED window.innerWidth, never the requested one
//   - the gap between the bottom of <main> and the top of <footer>
//   - whether the page is SHORTER than the viewport, which is the case where a
//     footer either sits correctly at the bottom or floats halfway up
//   - the computed vertical padding of every top-level <section>, so an
//     inconsistent rhythm shows up as a list of different numbers
//   - the social share row: its computed gap and the size of each control
//   - every interactive element under the 44px touch-target floor at 390
//
// Usage:
//   node scripts/visual-walk.mjs <baseUrl> --out <dir> [--storage <state.json>]
//                                [--tag before] [--only home,events]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] || '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: node scripts/visual-walk.mjs <baseUrl> --out <dir> [--storage f] [--tag t]')
  process.exit(2)
}
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const OUT = arg('--out', 'visual-walk')
const STORAGE = arg('--storage')
const TAG = arg('--tag', 'walk')
const ONLY = arg('--only')
const only = ONLY ? new Set(ONLY.split(',')) : null
/**
 * `--region bottom` captures the LAST VIEWPORT rather than the whole page.
 *
 * A full-page screenshot of a 9700px homepage is scaled so far down that the
 * join between the content and the footer, which is the thing under review,
 * becomes a few pixels of grey. The bottom viewport is what a reader actually
 * sees when they reach the end, so it is what a footer complaint has to be
 * judged on.
 */
const REGION = arg('--region', 'full')

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '1440', width: 1440, height: 900 },
]

/** Public surfaces. `auth: true` ones are skipped unless --storage is given. */
const SURFACES = [
  { name: 'home', path: '/' },
  { name: 'events', path: '/events' },
  { name: 'events-search-results', path: '/events?q=music' },
  { name: 'events-search-empty', path: '/events?q=zzqqxxnothinghere' },
  { name: 'events-filtered-price', path: '/events?price_max=40' },
  { name: 'categories-afrobeats', path: '/categories/afrobeats' },
  { name: 'cities', path: '/cities' },
  { name: 'city-melbourne', path: '/city/melbourne' },
  { name: 'suburb-inner-west', path: '/city/sydney/inner-west' },
  { name: 'communities', path: '/communities' },
  { name: 'community-african', path: '/community/african' },
  { name: 'community-african-sydney', path: '/community/african/sydney' },
  { name: 'artists', path: '/artists' },
  { name: 'launch', path: '/launch' },
  { name: 'organisers', path: '/organisers' },
  { name: 'organisers-signup', path: '/organisers/signup' },
  { name: 'pricing', path: '/pricing' },
  { name: 'help', path: '/help' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about' },
  { name: 'careers', path: '/careers' },
  { name: 'press', path: '/press' },
  { name: 'guides', path: '/guides' },
  { name: 'legal-terms', path: '/legal/terms' },
  { name: 'legal-privacy', path: '/legal/privacy' },
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
  { name: 'not-found', path: '/this-route-does-not-exist-visual-walk' },
  // Authenticated, skipped without --storage.
  { name: 'dashboard', path: '/dashboard', auth: true },
  { name: 'dashboard-events', path: '/dashboard/events', auth: true },
  { name: 'dashboard-events-new', path: '/dashboard/events/new', auth: true },
  { name: 'dashboard-venues', path: '/dashboard/venues', auth: true },
  { name: 'dashboard-payouts', path: '/dashboard/payouts', auth: true },
  { name: 'dashboard-settings', path: '/dashboard/settings', auth: true },
  { name: 'dashboard-team', path: '/dashboard/team', auth: true },
  { name: 'tickets', path: '/tickets', auth: true },
]

/** Runs in the page. Everything a spacing review needs, measured. */
const MEASURE = () => {
  const round = n => Math.round(n)
  const px = v => Math.round(parseFloat(v) || 0)

  const footer = document.querySelector('footer')
  const main = document.querySelector('main')
  const doc = document.documentElement

  const footerBox = footer ? footer.getBoundingClientRect() : null
  const mainBox = main ? main.getBoundingClientRect() : null

  // The gap a reader actually sees between the end of the content and the
  // start of the footer. Scroll position is irrelevant because both rects move
  // together, so the difference is stable.
  const mainToFooterGap =
    footerBox && mainBox ? round(footerBox.top - mainBox.bottom) : null

  const pageHeight = doc.scrollHeight
  const shorterThanViewport = pageHeight <= window.innerHeight + 1

  // Every top-level section inside main, with its computed vertical padding.
  // An inconsistent rhythm reads as a list of different pairs.
  const sections = main
    ? [...main.children]
        .filter(el => el.tagName === 'SECTION' || el.tagName === 'DIV')
        .slice(0, 40)
        .map(el => {
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '').slice(0, 40),
            paddingTop: px(cs.paddingTop),
            paddingBottom: px(cs.paddingBottom),
            marginTop: px(cs.marginTop),
            marginBottom: px(cs.marginBottom),
            height: round(r.height),
            borderTop: cs.borderTopWidth !== '0px',
          }
        })
    : []

  // The social share row, wherever it appears. Both the public event page and
  // the organiser view render one; the founder reports both as cramped.
  const shareRows = [...document.querySelectorAll('[data-share-bar], .share-bar')]
  let share = null
  const shareHeading = [...document.querySelectorAll('p, h2, h3')].find(el =>
    /share this event/i.test(el.textContent || ''),
  )
  const shareContainer =
    shareRows[0] ||
    (shareHeading && shareHeading.parentElement
      ? shareHeading.parentElement.querySelector('div,ul,nav')
      : null)
  if (shareContainer) {
    const cs = getComputedStyle(shareContainer)
    const kids = [...shareContainer.children].map(el => {
      const r = el.getBoundingClientRect()
      return { w: round(r.width), h: round(r.height), tag: el.tagName.toLowerCase() }
    })
    share = {
      display: cs.display,
      gap: cs.gap,
      columnGap: px(cs.columnGap),
      rowGap: px(cs.rowGap),
      flexWrap: cs.flexWrap,
      containerWidth: round(shareContainer.getBoundingClientRect().width),
      children: kids,
      overflows: shareContainer.scrollWidth > shareContainer.clientWidth + 1,
    }
  }

  // Touch targets under the 44px floor, visible and interactive only.
  const visible = el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const smallTargets = [...document.querySelectorAll('a, button, [role="button"], input, select')]
    .filter(visible)
    .map(el => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        w: round(r.width),
        h: round(r.height),
      }
    })
    .filter(t => t.h < 44 || t.w < 44)

  // Horizontal overflow: the single most obvious "nobody looked at this" defect.
  const horizontalOverflow = doc.scrollWidth > window.innerWidth + 1

  return {
    measuredWidth: window.innerWidth,
    measuredHeight: window.innerHeight,
    title: document.title,
    pageHeight,
    shorterThanViewport,
    horizontalOverflow,
    docScrollWidth: doc.scrollWidth,
    footerFound: Boolean(footer),
    footerHeight: footerBox ? round(footerBox.height) : null,
    footerPaddingTop: footer ? px(getComputedStyle(footer).paddingTop) : null,
    footerPaddingBottom: footer ? px(getComputedStyle(footer).paddingBottom) : null,
    mainToFooterGap,
    mainPaddingBottom: main ? px(getComputedStyle(main).paddingBottom) : null,
    sections,
    share,
    smallTargetCount: smallTargets.length,
    smallTargets: smallTargets.slice(0, 12),
  }
}

const outRoot = join(OUT, TAG)
mkdirSync(outRoot, { recursive: true })

const browser = await chromium.launch()
const report = { base: BASE, tag: TAG, surfaces: [] }

// One real event page and one organiser profile, discovered rather than pinned,
// because a hardcoded slug goes stale and then 404s in a way that reads as a
// platform defect.
const discovery = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const dp = await discovery.newPage()
const discovered = []
try {
  await dp.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await dp.waitForTimeout(1500)
  const eventHref = await dp.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="/events/"]')].find(
      x => (x.getAttribute('href') || '').split('/').length === 3,
    )
    return a ? a.getAttribute('href') : null
  })
  if (eventHref) discovered.push({ name: 'event-detail', path: eventHref })
  if (eventHref) {
    await dp.goto(`${BASE}${eventHref}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await dp.waitForTimeout(1200)
    const orgHref = await dp.evaluate(() => {
      const a = [...document.querySelectorAll('a[href^="/organisers/"]')].find(
        x => (x.getAttribute('href') || '').split('/').length === 3,
      )
      return a ? a.getAttribute('href') : null
    })
    if (orgHref) discovered.push({ name: 'organiser-profile', path: orgHref })
  }
} catch {
  // Discovery failing is reported, never silent: the surfaces simply do not appear.
}
await discovery.close()
if (discovered.length === 0) {
  console.error('[visual-walk] WARNING: discovered no event page. The walk is INCOMPLETE.')
}

const plan = [...SURFACES.slice(0, 5), ...discovered, ...SURFACES.slice(5)].filter(
  s => (!s.auth || STORAGE) && (!only || only.has(s.name)),
)

for (const viewport of VIEWPORTS) {
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  }
  if (STORAGE && existsSync(STORAGE)) contextOptions.storageState = STORAGE
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  mkdirSync(join(outRoot, viewport.label), { recursive: true })

  for (const surface of plan) {
    const url = `${BASE}${surface.path}`
    const entry = { name: surface.name, path: surface.path, viewport: viewport.width }
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      entry.status = res ? res.status() : 0
      await page.waitForTimeout(1500)
      // Settle lazy imagery so a screenshot is not of a skeleton.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(800)
      if (REGION !== 'bottom') {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(400)
      }
      const file = join(outRoot, viewport.label, `${surface.name}.png`)
      await page.screenshot({ path: file, fullPage: REGION !== 'bottom' })
      entry.screenshot = file
      Object.assign(entry, await page.evaluate(MEASURE))
      entry.landedOn = new URL(page.url()).pathname
    } catch (err) {
      entry.error = String(err).slice(0, 160)
    }
    report.surfaces.push(entry)
    const flag = entry.error
      ? 'ERROR'
      : entry.horizontalOverflow
        ? 'H-OVERFLOW'
        : entry.mainToFooterGap !== null && entry.mainToFooterGap < 8
          ? 'FOOTER-TIGHT'
          : 'ok'
    console.log(
      `[visual-walk] ${viewport.label.padStart(4)}px  ${String(entry.status ?? '-').padStart(3)}  ` +
        `${surface.name.padEnd(28)} gap=${String(entry.mainToFooterGap ?? '-').padStart(5)}  ` +
        `h=${String(entry.pageHeight ?? '-').padStart(6)}  small=${String(entry.smallTargetCount ?? '-').padStart(3)}  ${flag}`,
    )
  }
  await context.close()
}

await browser.close()
writeFileSync(join(outRoot, 'report.json'), JSON.stringify(report, null, 2))

const widths = [...new Set(report.surfaces.map(s => s.measuredWidth).filter(Boolean))]
console.log(`\n[visual-walk] ${report.surfaces.length} capture(s) written to ${outRoot}`)
console.log(`[visual-walk] MEASURED innerWidth across the run: ${widths.join(', ')}`)
console.log(`[visual-walk] surfaces with an error: ${report.surfaces.filter(s => s.error).length}`)
console.log(
  `[visual-walk] horizontal overflow: ${report.surfaces.filter(s => s.horizontalOverflow).length}`,
)
