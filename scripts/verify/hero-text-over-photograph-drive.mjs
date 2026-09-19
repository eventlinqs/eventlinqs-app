/**
 * HERO TEXT OVER A PHOTOGRAPH. What a reader's eye actually receives on the
 * text the platform paints on top of a picture, measured rather than computed
 * from a stylesheet.
 *
 * WHY A DRIVE AND NOT A TEST. Every other contrast gate on this platform
 * computes its ratio from `globals.css`: a token against a token, which is the
 * right thing to do when both sides are declared. A hero declares only one
 * side. The other side is a JPEG that the licensed spine, a bundled raster or a
 * third-party photo API chose, composited under a hand-written navy gradient,
 * and no amount of arithmetic about a stylesheet can tell you how bright the
 * sky is behind the word MELBOURNE. Only the painted pixel can.
 *
 * HOW THE BACKGROUND IS OBTAINED, with no heuristic anywhere in it. For each
 * text run the page is screenshotted TWICE at the same scroll offset: once as
 * shipped, and once with `color: transparent` on that one element. The glyph
 * pixels are then the pixels that DIFFER between the two captures, and the
 * background under each of them is its value in the second capture. Nothing is
 * sampled "near" the text and nothing is averaged over a box.
 *
 * WHY THE GLYPHS ARE UNPAINTED RATHER THAN THE ELEMENT HIDDEN. The first
 * version used `visibility: hidden`, which preserves layout and looked
 * equivalent. It is not, and /events/[slug] is where that showed: its category
 * chip carries its OWN opaque backing, so hiding the element took the backing
 * away with the text and the "revealed" pixels were the photograph the chip
 * covers. The chip measured 1.87:1 against a background no reader ever sees.
 * Making the text transparent removes the glyphs and NOTHING else, so a run is
 * always judged against what actually sits behind it, whether that is a
 * photograph or its own pill. It also removed the need to skip self-backed runs
 * at all, which is why 135 runs that the earlier sweep declined to measure are
 * now measured.
 *
 * WHICH PIXELS COUNT. Antialiased edge pixels carry only a fraction of the
 * foreground colour, so judging them would overstate the fault. Only CORE
 * pixels are judged: the ones the browser painted at full glyph coverage,
 * which are what a reader sees as the letter.
 *
 * FULL COVERAGE IS COMPUTED, NOT ASSUMED TO BE THE DECLARED COLOUR, because a
 * hero subtitle is `text-white/85` and a translucent foreground has no single
 * painted colour: what lands on the page is `a x fg + (1-a) x background`, and
 * the background is the photograph, so it differs pixel by pixel. The drive
 * resolves the computed `color` to sRGB AND its alpha (through a canvas, so
 * `oklab()` and every other modern colour space the stylesheet may emit is the
 * browser's problem rather than this file's), composites it over the revealed
 * background per pixel, and calls a pixel core when the shipped capture matches
 * that composite. At alpha 1 this reduces exactly to "equals the declared
 * colour". The ratio is then taken between that composited glyph colour and its
 * own background, which is the pair the eye actually receives.
 *
 * THE FLOORS, from the primary source (Law 7), fetched 2026-09-19:
 *   normal text            4.5:1   WCAG 2.2 SC 1.4.3
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   large text             3:1     same page. Large is >= 24px, or >= 18.66px
 *                                  when the computed weight is 700 or more.
 *     https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *   Size is read from the element at the viewport under test, never assumed,
 *   because every hero headline steps down at 390.
 *
 * WHAT IS REPORTED PER RUN: the worst core pixel, the median, and the share of
 * core pixels below the floor. The VERDICT is taken on the worst pixel, because
 * a letter that is unreadable is unreadable whatever the other letters do, and
 * the median is printed beside it so the size of a failure is never guessed.
 *
 * WHAT THIS SWEEP HAD NEVER LOOKED AT UNTIL 20 SEPTEMBER 2026. Three blind
 * spots, each of which made a green report mean less than it appeared to.
 *
 *   EVERY SLIDE, NOT SLIDE ONE. The homepage hero is a five-slide carousel and
 *   every measurement ever taken of it was of the first slide: the other four
 *   carry `hidden` until rotation arms, and rotation never arms for a headless
 *   agent (Motion law). Walking all five found the gold eyebrow at 2.85:1 and
 *   2.53:1 on two of them at 390. The drive now presses the dots the way a
 *   reader does, and REFUSES to report a route whose slides did not each yield
 *   their own distinct text, because a hero measured five times on one
 *   photograph prints five green lines and means nothing.
 *
 *   EVERY BAND, NOT THE FIRST. It read `document.querySelector`, so a page with
 *   a second hero further down was judged on its first one.
 *
 *   EVERY HERO, NOT FOUR TEMPLATES. Its coverage table named four templates by
 *   hand. Thirteen files render a hero that paints text on a photograph; nine
 *   were absent, and four of those were failing. The table is now judged
 *   against `deriveHeroFiles()`, the same derivation the guard and the suite
 *   read, and the drive refuses to run when a hero has no route.
 *
 * Usage:
 *   BASE=http://localhost:3200 node scripts/verify/hero-text-over-photograph-drive.mjs \
 *     --out C:\dev\EVIDENCE\HERO-CONTRAST --label green
 *   ... --only /categories/technology       measure one route
 *   ... --shots                             write a PNG per measured run
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOT_YET_ON_THE_SHARED_WASH, deriveHeroFiles } from '../guards/lib/hero-files.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/HERO-CONTRAST'
let label = 'run'
let shots = false
let routesFile = null
const only = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--label') label = args[++i]
  else if (args[i] === '--only') only.push(args[++i])
  else if (args[i] === '--shots') shots = true
  else if (args[i] === '--routes-file') routesFile = args[++i]
}
out = join(out, `drive-${label}`)
mkdirSync(out, { recursive: true })

const BASE = (process.env.BASE ?? 'http://localhost:3200').replace(/\/$/, '')

/* ── The routes, ENUMERATED FROM SOURCE, never typed here ──────────────────
 * A slug typed into a drive is a slug that silently stops existing. Each
 * family is read out of the module that declares it, and the drive refuses to
 * run if a family comes back implausibly small, so a renamed export fails
 * loudly instead of quietly measuring four pages.
 */
const enumerate = (file, re, min, what) => {
  const found = [...readFileSync(file, 'utf8').matchAll(re)].map(m => m[1])
  const uniq = [...new Set(found)]
  if (uniq.length < min) {
    console.error(`[hero-contrast] BROKEN DRIVE: only ${uniq.length} ${what} enumerated from ${file} (expected >= ${min}).`)
    process.exit(1)
  }
  return uniq
}

const CATEGORIES = enumerate('src/lib/categories/category-editorial.ts', /^ {4}slug: '([a-z-]+)',$/gm, 20, 'category slug(s)')
const COMMUNITIES = enumerate('src/lib/communities/data.ts', /^ {4}slug: '([a-z-]+)',$/gm, 15, 'community slug(s)')

/*
 * CITIES AND SUBURBS LIVE IN ONE FILE AND ARE NOT THE SAME THING, which the
 * first version of this drive did not notice: `slug: '...'` matched both, so
 * the sweep asked for /city/sydney-inner-west 48 times and counted 72 clean
 * 404s as failures. A suburb IS worth measuring - it renders the same CityHero
 * - but at its own URL, which the page builds as `${city.slug}-${suburb}`, so
 * the city prefix comes off. Both shapes are matched by the field that tells
 * them apart rather than by indentation.
 */
const CITIES = enumerate('src/lib/cities/data.ts', /^ {4}slug: '([a-z-]+)', name: '[^']+', state:/gm, 20, 'city slug(s)')
const SUBURBS = [
  ...readFileSync('src/lib/cities/data.ts', 'utf8').matchAll(/^ {4}slug: '([a-z-]+)', citySlug: '([a-z-]+)',/gm),
].map(m => ({ city: m[2], suburb: m[1].startsWith(`${m[2]}-`) ? m[1].slice(m[2].length + 1) : m[1] }))
if (SUBURBS.length < 10) {
  console.error(`[hero-contrast] BROKEN DRIVE: only ${SUBURBS.length} suburb(s) enumerated from src/lib/cities/data.ts.`)
  process.exit(1)
}

/*
 * WHY EVERY SLUG AND NOT A SAMPLE. The declared side of this contrast is one
 * colour on every one of these pages; the undeclared side is a different
 * photograph on each. A sample of three would measure three photographs and
 * say nothing about the other hundred, and the failures this drive exists to
 * find are exactly the ones that depend on which picture landed.
 */
const ROUTES = [
  '/',
  '/this-weekend',
  '/cities',
  '/communities',
  ...CATEGORIES.map(s => `/categories/${s}`),
  ...CITIES.map(s => `/city/${s}`),
  ...SUBURBS.map(s => `/city/${s.city}/${s.suburb}`),
  /* PhotographicCityHero renders HERE and on no other family. The first
   * version of this drive left it out, and a template with its own gradient
   * would then have been "measured" by a sweep that never loaded a page it
   * appears on. Every hero template must have at least one route in this list. */
  ...CITIES.map(s => `/events/browse/${s}`),
  ...COMMUNITIES.map(s => `/community/${s}`),
  /* The marketing heroes, added 20 September 2026. They were absent because the
   * table below was four templates chosen by hand, and four of these five were
   * failing while the sweep reported the platform green: /waitlist's eyebrow at
   * 1.01:1 with 100 per cent of its pixels below floor, /about's at 1.01:1,
   * /organisers' headline at 1.49:1, /launch's eyebrow at 1.50:1. */
  '/about',
  '/launch',
  '/waitlist',
  '/forecast',
  '/organisers',
]
/*
 * EVERY HERO TEMPLATE MUST HAVE A ROUTE IN THAT LIST, and the drive refuses to
 * run if one does not. This is not decoration: the first version of this file
 * measured 91 routes, reported on four templates, and had never loaded a single
 * page that renders PhotographicCityHero. A sweep that is missing a family does
 * not look any different from a sweep that is green.
 */
const TEMPLATE_ROUTES = {
  'src/components/templates/PhotographicCategoryHero.tsx': '/categories/',
  'src/components/templates/PhotographicCityHero.tsx': '/events/browse/',
  'src/components/templates/PhotographicCommunityHero.tsx': '/community/',
  'src/components/features/city/city-hero.tsx': '/city/',
  'src/components/features/home/FeaturedHero.tsx': '/',
  'src/components/features/home/FeaturedHeroClient.tsx': '/',
  'src/app/about/page.tsx': '/about',
  'src/app/launch/page.tsx': '/launch',
  'src/app/waitlist/page.tsx': '/waitlist',
  'src/app/forecast/page.tsx': '/forecast',
  'src/components/templates/OrganisersLandingPage.tsx': '/organisers',
}
/*
 * TWO FAMILIES THIS TABLE CANNOT COVER FROM SOURCE, said here rather than left
 * as an absence.
 *
 *   `src/app/events/[slug]/page.tsx` - its slugs are database rows, so the only
 *   honest way to name them is to read them back out of the product's own
 *   sitemap and hand them in with --routes-file. It is measured by the separate
 *   run recorded beside this drive's evidence.
 *
 *   `src/components/ui/CategoryHeroEmpty.tsx` - its photographic branch is
 *   `onPhoto = !!coverImage` and not one of its eleven call sites passes a
 *   cover, so no URL on the platform renders it over a picture. There is no
 *   route to name. `hero-text-over-a-photograph.mjs` holds that claim as a
 *   register entry and fails the build the day a caller passes one.
 */
const UNROUTABLE_HEROES = new Set([
  'src/app/events/[slug]/page.tsx',
  'src/components/ui/CategoryHeroEmpty.tsx',
])

/*
 * THE TABLE IS JUDGED AGAINST THE DERIVED HERO SET, NOT TRUSTED.
 *
 * Until 20 September 2026 this table held four templates chosen by hand and
 * nothing compared it to the platform. Thirteen files render a hero that paints
 * text on a photograph; nine were absent from the sweep, and four of those were
 * failing WCAG 2.2 SC 1.4.3 while the drive printed ALL GREEN over 111 routes.
 * A sweep that is missing a family does not look any different from a sweep
 * that is green, so the drive now refuses to run when one is missing.
 */
const derivedHeroes = deriveHeroFiles()
const uncovered = derivedHeroes.filter(f => !(f in TEMPLATE_ROUTES) && !UNROUTABLE_HEROES.has(f))
if (uncovered.length) {
  console.error(
    `[hero-contrast] BROKEN DRIVE: ${uncovered.length} hero(es) paint text on a photograph and this sweep loads no route that renders them:`,
  )
  for (const f of uncovered) console.error(`  ${f}`)
  console.error('  Add a route to TEMPLATE_ROUTES, or state in UNROUTABLE_HEROES why no URL can reach it.')
  process.exit(1)
}
for (const [file, prefix] of Object.entries(TEMPLATE_ROUTES)) {
  readFileSync(file, 'utf8') // throws loudly if a template was renamed
  if (!derivedHeroes.includes(file)) {
    console.error(`[hero-contrast] BROKEN DRIVE: ${file} is in this table and is no longer a hero. Remove it.`)
    process.exit(1)
  }
  if (!ROUTES.some(r => r === prefix || r.startsWith(prefix))) {
    console.error(`[hero-contrast] BROKEN DRIVE: ${file} renders on ${prefix}* and this sweep loads no such route.`)
    process.exit(1)
  }
}

console.log(
  `[hero-contrast] enumerated ${CATEGORIES.length} categories, ${CITIES.length} cities, ${SUBURBS.length} suburbs, ${COMMUNITIES.length} communities -> ${ROUTES.length} routes`,
)

/*
 * A ROUTE LIST FROM OUTSIDE, for the families whose slugs are ROWS rather than
 * source. Event detail slugs exist only in the database, so the honest way to
 * name them is to read them back out of the product's own sitemap and hand the
 * list in, never to type one.
 */
const FROM_FILE = routesFile
  ? readFileSync(routesFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('/'))
  : []
if (routesFile && FROM_FILE.length === 0) {
  console.error(`[hero-contrast] BROKEN DRIVE: ${routesFile} held no route beginning with '/'.`)
  process.exit(1)
}

const TARGETS = FROM_FILE.length
  ? FROM_FILE
  : only.length
    ? ROUTES.filter(r => only.includes(r))
    : ROUTES
if (only.length && TARGETS.length !== only.length) {
  console.error(`[hero-contrast] --only named a route this drive does not know: ${only.filter(o => !ROUTES.includes(o)).join(', ')}`)
  process.exit(1)
}

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

const TEXT_FLOOR = 4.5
const LARGE_FLOOR = 3
/** How close a painted pixel must be to the computed colour to count as core. */
const CORE_TOLERANCE = 10

const srgb = c => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const contrast = (a, b) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
/** Composite a resolved {rgb, alpha} foreground over one background pixel. */
const composite = (fg, alpha, bg) => [
  alpha * fg[0] + (1 - alpha) * bg[0],
  alpha * fg[1] + (1 - alpha) * bg[1],
  alpha * fg[2] + (1 - alpha) * bg[2],
]
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

const raw = async buf => {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height, ch: info.channels }
}

/* ── A HERO THAT IS A CAROUSEL IS SEVERAL PHOTOGRAPHS, NOT ONE ─────────────
 *
 * The homepage hero rotates through five featured events. Every contrast
 * measurement ever taken of it, including this drive's own first sweep, was of
 * SLIDE ONE, because the other four carry `hidden` until rotation arms and
 * rotation never arms for a headless agent (Motion law: armed only under
 * html[data-motion="1"], which is deliberately withheld from audits). So four
 * fifths of the most visited hero on the platform had never been looked at, and
 * a sweep that reports "home PASS" about one of five photographs is not
 * evidence about the hero.
 *
 * Manual navigation works without arming - the component puts the targeted
 * slide into layout on demand - so the drive presses the dots the way a reader
 * does. The slides are ENUMERATED FROM THE PAGE (the tablist the component
 * renders), never counted in this file, so a sixth featured event is measured
 * the day it is published and nothing here has to be told.
 */
async function discoverSlides(page, sel, band) {
  return page.evaluate(
    ({ s, b }) => {
      const el = document.querySelectorAll(s)[b]
      if (!el) return { count: 1, labels: [] }
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      return { count: Math.max(1, tabs.length), labels: tabs.map(t => t.getAttribute('aria-label') ?? '') }
    },
    { s: sel, b: band },
  )
}

/** Press slide `idx` and wait until the component reports it selected and its raster has decoded. */
async function selectSlide(page, sel, band, idx) {
  await page.evaluate(
    ({ s, b, n }) => {
      const el = document.querySelectorAll(s)[b]
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      tabs[n]?.click()
    },
    { s: sel, b: band, n: idx },
  )
  await page.waitForFunction(
    ({ s, b, n }) => {
      const el = document.querySelectorAll(s)[b]
      if (!el) return false
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      if (tabs[n]?.getAttribute('aria-selected') !== 'true') return false
      const live = [...el.querySelectorAll('img')].filter(i => {
        const r = i.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })
      return live.length > 0 && live.every(i => i.complete && i.naturalWidth > 0)
    },
    { s: sel, b: band, n: idx },
    { timeout: 30000 },
  )
  /* The crossfade is a 700ms eased opacity transition (FeaturedHeroClient).
   * Measuring inside it would measure two photographs at once. */
  await page.waitForTimeout(900)
}

const rows = []
const browser = await chromium.launch()
try {
  for (const route of TARGETS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      })
      const page = await ctx.newPage()
      const pageId = `${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}@${vp.label}`
      let res
      try {
        res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 })
      } catch (e) {
        check(pageId, false, `navigation threw: ${e.message}`)
        await ctx.close()
        continue
      }
      if (!res || res.status() !== 200) {
        check(pageId, false, `answered ${res ? res.status() : 'no response'}`)
        await ctx.close()
        continue
      }

      /* The hero image owns the LCP; measuring before it decodes would measure
       * the empty box behind it. Wait for every image inside the hero band to
       * report complete, then let one frame settle. */
      const heroSel = ':is(.hero-marketing, .hero-marketing-grow)'
      /* EVERY BAND, NOT THE FIRST. This read `document.querySelector` until
       * 20 September 2026, so a page with a second hero further down was
       * measured on its first one and reported clean. The shared empty state
       * (`CategoryHeroEmpty`) is exactly that shape: it paints its own
       * photograph and its own text below the page hero, and no sweep had ever
       * looked at it. */
      const bandCount = await page.locator(heroSel).count()
      if (bandCount === 0) {
        check(pageId, false, 'renders no hero band at the locked scale to measure')
        await ctx.close()
        continue
      }
      await page.waitForFunction(
        sel => [...document.querySelectorAll(sel)].every(b => [...b.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0)),
        heroSel,
        { timeout: 30000 },
      ).catch(() => {})
      await page.waitForTimeout(400)

      for (let bandIdx = 0; bandIdx < bandCount; bandIdx += 1) {
      /* A band below the fold has to be brought into the viewport before it is
       * screenshotted: the captures are viewport-sized and every run rectangle
       * is in viewport coordinates, so an off-screen band yields no pixels at
       * all, which the drive would otherwise report as "the run is invisible". */
      await page.evaluate(
        ({ s, b }) => document.querySelectorAll(s)[b]?.scrollIntoView({ block: 'center', behavior: 'instant' }),
        { s: heroSel, b: bandIdx },
      )
      /*
       * AND THEN WAIT FOR IT TO STOP MOVING. Scrolling a band into view is what
       * ARMS the platform's scroll reveal: every below-the-fold section
       * fade-rises as it enters the viewport (Motion law, reveal.tsx). A capture
       * taken mid-rise is taken of an element that is translated and part-way
       * transparent, so the second capture does not line up with the first and
       * every run comes back "no fully covered glyph pixel found".
       *
       * That is what happened on the first run of this code: 18 runs on the
       * second band of a suburb page and a community page were reported as
       * invisible, and every one of them is perfectly visible. A fixed 300ms
       * pause was the whole bug. The wait is now on the CONDITION rather than on
       * a duration: opaque, and no transform left on the band or on any element
       * inside it.
       */
      await page
        .waitForFunction(
          ({ s, b }) => {
            const band = document.querySelectorAll(s)[b]
            if (!band) return false
            const settled = el => {
              const cs = getComputedStyle(el)
              const t = cs.transform
              return Number(cs.opacity) > 0.99 && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)')
            }
            if (!settled(band)) return false
            return [...band.querySelectorAll('*')].every(settled)
          },
          { s: heroSel, b: bandIdx },
          { timeout: 15000 },
        )
        .catch(() => {})
      await page.waitForTimeout(250)

      const slides = await discoverSlides(page, heroSel, bandIdx)
      const id = bandCount > 1 ? `${pageId} band ${bandIdx + 1} of ${bandCount}` : pageId
      /* The headline of each slide, collected as it is measured. Two slides that
       * report the same headline mean a press did not take and the drive
       * measured one photograph twice, which is a false pass and is refused
       * below rather than printed as five green slides. */
      const headlinePerSlide = []

      const measureSlide = async slideIdx => {
      const label = slides.count > 1 ? `${id} slide ${slideIdx + 1} of ${slides.count}` : id

      /*
       * THE TEXT RUNS ARE FOUND BY WHAT THEY ARE, NOT BY A CLASS STRING. Four
       * hero templates write four different class lists for the same eyebrow,
       * so matching a class would measure whichever template the author of the
       * drive happened to read. A run is any element inside the hero band that
       * owns visible text of its own and paints no opaque background behind it.
       * Every run is measured, including one that carries its own backing: the
       * method below reveals whatever is genuinely behind the glyphs, so a pill
       * is judged on its pill and a headline on its photograph.
       */
      const runs = await page.evaluate(({ sel, b }) => {
        const band = document.querySelectorAll(sel)[b]
        if (!band) return []
        /*
         * CLEAR EVERY PREVIOUS TAG IN THE DOCUMENT FIRST. The runs are addressed
         * later by `[data-hero-run="n"]`, and querySelector returns the first
         * match in DOCUMENT order. Anything measured before this pass - the
         * previous slide of this carousel, or the previous BAND on this page -
         * is still in the document carrying tag 0 and comes first, so every
         * unpaint would be applied to that stale element and the capture would
         * never change. The drive reports that as "the run is invisible", which
         * is an accusation against the product for the harness's own fault.
         *
         * IT WAS WRITTEN TWICE BEFORE IT WAS RIGHT. The first version cleared
         * nothing and 48 carousel runs came back invisible. The second cleared
         * `band.querySelectorAll(...)`, which fixed the slides and left the
         * bands: 17 perfectly visible runs on the second band of a suburb page
         * were reported invisible, and the screenshot of the exact frame the
         * drive measured showed the text plainly painted. The scope is the
         * DOCUMENT, because that is the scope querySelector uses.
         */
        for (const stale of document.querySelectorAll('[data-hero-run]')) stale.removeAttribute('data-hero-run')
        const found = []
        for (const el of band.querySelectorAll('*')) {
          const own = [...el.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join(' ')
            .trim()
          if (!own) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue
          const b = el.getBoundingClientRect()
          if (b.width < 2 || b.height < 2) continue
          /* The browser resolves the colour, whatever space the stylesheet
           * wrote it in. A 1x1 canvas filled with the computed string reports
           * the sRGB triple and the alpha, which is exactly what is painted. */
          const cv = document.createElement('canvas')
          cv.width = 1
          cv.height = 1
          const cx = cv.getContext('2d')
          cx.clearRect(0, 0, 1, 1)
          cx.fillStyle = cs.color
          cx.fillRect(0, 0, 1, 1)
          const px = cx.getImageData(0, 0, 1, 1).data
          const alpha = px[3] / 255
          /* getImageData returns UN-premultiplied channels, so these are
           * already the source colour. Dividing by alpha here was tried and is
           * wrong: white at 0.85 came back as 300 per channel and no pixel on
           * the page could ever match it, which the drive then reported as
           * "the run is invisible" against three perfectly visible subtitles. */
          const srcRgb = [px[0], px[1], px[2]]
          found.push({
            text: own.slice(0, 40),
            tag: el.tagName.toLowerCase(),
            color: cs.color,
            rgb: srcRgb,
            alpha,
            fontSize: parseFloat(cs.fontSize),
            fontWeight: cs.fontWeight,
            rect: { x: b.x, y: b.y, width: b.width, height: b.height },
          })
          el.setAttribute('data-hero-run', String(found.length - 1))
        }
        return found
      }, { sel: heroSel, b: bandIdx })

      if (runs.length === 0) {
        check(label, false, 'hero band holds no text run to measure')
        return 0
      }
      headlinePerSlide[slideIdx] = runs.map(r => r.text).join(' | ')

      let measured = 0

      for (const [i, run] of runs.entries()) {
        /*
         * EVERY RUN IS BROUGHT INTO VIEW ON ITS OWN, and its rectangle is read
         * again after the scroll rather than reused.
         *
         * The captures are viewport-sized and the rectangles are in viewport
         * coordinates, so a run that sits outside the viewport has no pixels in
         * either capture and the drive would report it as "the run is
         * invisible". That is exactly what happened to the two trust pillars at
         * the foot of a tall empty-state band at 390: the band was centred, and
         * they were below the fold of the centred band. Scrolling the BAND is
         * not enough when the band is taller than the phone.
         *
         * Centring each run also lifts it clear of anything pinned to the
         * bottom of the viewport, such as the consent banner, which would
         * otherwise sit over the text in BOTH captures and cancel itself out.
         */
        const rect = await page.evaluate(n => {
          const el = document.querySelector(`[data-hero-run="${n}"]`)
          if (!el) return null
          el.scrollIntoView({ block: 'center', behavior: 'instant' })
          const b = el.getBoundingClientRect()
          return { x: b.x, y: b.y, width: b.width, height: b.height }
        }, i)
        if (!rect) {
          check(`${label} "${run.text}"`, false, 'the run could not be found again after it was tagged')
          continue
        }
        await page.waitForTimeout(150)

        const shipped = await raw(await page.screenshot())
        // Unpaint this one run's glyphs; nothing else about the frame changes.
        await page.evaluate(n => {
          const el = document.querySelector(`[data-hero-run="${n}"]`)
          if (el) el.style.color = 'transparent'
        }, i)
        const bare = await raw(await page.screenshot())
        await page.evaluate(n => {
          const el = document.querySelector(`[data-hero-run="${n}"]`)
          if (el) el.style.color = ''
        }, i)

        const fg = run.rgb
        const alpha = run.alpha
        const x0 = Math.max(0, Math.floor(rect.x))
        const y0 = Math.max(0, Math.floor(rect.y))
        const x1 = Math.min(shipped.w, Math.ceil(rect.x + rect.width))
        const y1 = Math.min(shipped.h, Math.ceil(rect.y + rect.height))

        const ratios = []
        let worst = null
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const p = (y * shipped.w + x) * shipped.ch
            const a = [shipped.data[p], shipped.data[p + 1], shipped.data[p + 2]]
            const b = [bare.data[p], bare.data[p + 1], bare.data[p + 2]]
            // unchanged by hiding the run: not a glyph pixel
            if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue
            // What a fully covered pixel MUST look like over this background.
            const full = composite(fg, alpha, b)
            // Anything short of that is an antialiased edge, not core.
            if (
              Math.abs(a[0] - full[0]) > CORE_TOLERANCE ||
              Math.abs(a[1] - full[1]) > CORE_TOLERANCE ||
              Math.abs(a[2] - full[2]) > CORE_TOLERANCE
            ) continue
            const r = contrast(full, b)
            ratios.push(r)
            if (worst === null || r < worst.r) worst = { r, bg: b, fgPainted: full, x, y }
          }
        }

        const large = run.fontSize >= 24 || (run.fontSize >= 18.66 && Number(run.fontWeight) >= 700)
        const floor = large ? LARGE_FLOOR : TEXT_FLOOR
        const runId = `${label} "${run.text}"`

        if (ratios.length === 0) {
          check(runId, false, `no fully covered glyph pixel found (fg ${hex(fg)} a=${alpha} at ${run.fontSize}px): the run is invisible or the capture did not change`)
          rows.push({ route, viewport: vp.label, slide: slideIdx + 1, slides: slides.count, text: run.text, corePixels: 0 })
          continue
        }
        measured += 1
        ratios.sort((a, b) => a - b)
        const median = ratios[Math.floor(ratios.length / 2)]
        const below = ratios.filter(r => r < floor).length
        const share = (below / ratios.length) * 100
        rows.push({
          route,
          viewport: vp.label,
          slide: slideIdx + 1,
          slides: slides.count,
          text: run.text,
          tag: run.tag,
          fg: hex(fg),
          alpha,
          fontSizePx: run.fontSize,
          fontWeight: run.fontWeight,
          floor,
          corePixels: ratios.length,
          worst: Number(worst.r.toFixed(2)),
          worstBg: hex(worst.bg),
          worstFgPainted: hex(worst.fgPainted),
          worstAt: { x: worst.x, y: worst.y },
          median: Number(median.toFixed(2)),
          shareBelowFloorPct: Number(share.toFixed(1)),
        })
        check(
          runId,
          worst.r >= floor,
          `${hex(fg)}${alpha < 1 ? `@${alpha}` : ''} ${run.fontSize}px/${run.fontWeight} worst ${worst.r.toFixed(2)}:1 on ${hex(worst.bg)}, median ${median.toFixed(2)}:1, ${share.toFixed(1)}% of ${ratios.length} core px below ${floor}`,
        )
      }

      if (shots) {
        await page.screenshot({ path: join(out, `${label.replace(/[@ ]/g, '-')}.png`) })
      }
      return measured
      }

      for (let s = 0; s < slides.count; s += 1) {
        if (s > 0) {
          try {
            await selectSlide(page, heroSel, bandIdx, s)
          } catch (e) {
            check(`${id} slide ${s + 1} of ${slides.count}`, false, `could not be reached: ${e.message.split('\n')[0]}`)
            continue
          }
        }
        const measured = await measureSlide(s)
        if (measured === 0) {
          check(`${id} slide ${s + 1} of ${slides.count} coverage`, false, 'every text run in the hero was skipped or unmeasurable')
        }
      }

      /* THE ANTI-FALSE-PASS. A hero that advertises five slides and measures
       * one photograph five times would print five green lines and mean
       * nothing. Every slide must have produced its own distinct set of text,
       * and if two match, the press did not take and this route's result is
       * refused rather than reported. */
      if (slides.count > 1) {
        const seen = headlinePerSlide.filter(Boolean)
        const distinct = new Set(seen).size
        check(
          `${id} walked all ${slides.count} slides`,
          seen.length === slides.count && distinct === slides.count,
          `${seen.length} of ${slides.count} slides measured, ${distinct} distinct text set(s): ${slides.labels.map((l, i) => `${i + 1}=${l.slice(0, 30)}`).join('; ')}`,
        )
      }
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

/*
 * ── KNOWN, REGISTERED DEBT IS REPORTED SEPARATELY FROM A NEW FAILURE ───────
 *
 * Three heroes are not yet on the shared wash and sit behind the lane border:
 * they are lane B's organiser marketing surfaces, measured on 20 September 2026
 * and written into `NOT_YET_ON_THE_SHARED_WASH` beside their numbers. If their
 * routes counted as ordinary failures this sweep would be permanently red, and
 * a check that is always red is a check nobody runs, which is how the thing it
 * was watching gets through.
 *
 * So they are bucketed, never hidden: every one is printed with its measurement
 * and the lane that owns it, and the sweep still exits 1 the moment a failure
 * appears anywhere else. The register only ever shrinks, and the guard is what
 * enforces that.
 */
const registeredPrefixes = NOT_YET_ON_THE_SHARED_WASH.map(e => e.file)
  .map(f => TEMPLATE_ROUTES[f])
  .filter(Boolean)
const idRoute = id => {
  const slug = id.split('@')[0]
  return slug === 'home' ? '/' : `/${slug}`
}
const isRegistered = id => {
  const route = idRoute(id)
  return registeredPrefixes.some(p => route === p || (p !== '/' && route.startsWith(p)))
}

const known = checks.filter(c => !c.ok && isRegistered(c.id))
const novel = checks.filter(c => !c.ok && !isRegistered(c.id))

writeFileSync(
  join(out, 'drive.json'),
  JSON.stringify(
    { base: BASE, routes: TARGETS.length, registered: NOT_YET_ON_THE_SHARED_WASH, checks, rows },
    null,
    2,
  ),
)
const passed = checks.filter(c => c.ok).length
console.log(`\n${passed} of ${checks.length} checks passed across ${TARGETS.length} route(s) x ${VIEWPORTS.length} viewports`)

if (known.length) {
  console.log(`\n${known.length} KNOWN failure(s) on heroes registered as not yet on the shared wash:`)
  for (const e of NOT_YET_ON_THE_SHARED_WASH) {
    const prefix = TEMPLATE_ROUTES[e.file]
    if (!prefix) continue
    const mine = known.filter(c => {
      const route = idRoute(c.id)
      return route === prefix || (prefix !== '/' && route.startsWith(prefix))
    })
    if (!mine.length) continue
    console.log(`  ${e.file} (lane ${e.lane}) - ${mine.length} run(s)`)
    console.log(`    recorded: ${e.measured}`)
    console.log(`    record:   ${e.record}`)
  }
  console.log('  These do NOT fail this sweep. They fail the build the day they leave the register.')
}

if (novel.length) {
  console.log(`\n${novel.length} FAILURE(S):`)
  for (const c of novel) console.log(`  ${c.id}: ${c.detail}`)
  process.exit(1)
}
console.log(known.length ? 'GREEN outside the register' : 'ALL GREEN')
