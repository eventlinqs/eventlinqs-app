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
 *   against the derivation the guard and the suite read, and the drive refuses
 *   to run when a surface has no route.
 *
 *   AND THEN: EVERY SURFACE, NOT EVERY HERO. The three above were all fixed on
 *   20 September and the sweep was still keyed on `.hero-marketing`, the locked
 *   hero scale. The constitution carves an exception out of that token in the
 *   same paragraph that locks it ("the two profile heroes keep their own inline
 *   scale"), so the mark had documented blind spots, and behind them sat the
 *   auth brand panel with its EVENTLINQS wordmark painting `text-ink-900` on a
 *   photograph at 1.00:1, on every sign-in and sign-up page. The band is no
 *   longer found by a class at all: see the derivation below, which asks the
 *   BROWSER what is painted over what.
 *
 * Usage:
 *   BASE=http://localhost:3200 node scripts/verify/hero-text-over-photograph-drive.mjs \
 *     --out C:\dev\EVIDENCE\HERO-CONTRAST --label green
 *   ... --only /categories/technology       measure one route
 *   ... --shots                             write a PNG per measured run
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOT_YET_ON_THE_SHARED_WASH, derivePhotographicTextSurfaces } from '../guards/lib/hero-files.mjs'

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

/*
 * THE AUTH FAMILY, enumerated from the route tree rather than typed, because
 * the thing that made this family invisible was somebody's list. Every page
 * that renders <AuthShell> carries a full-bleed platform photograph behind the
 * wordmark and two locked taglines, at lg and wider, and no contrast check on
 * this platform had ever loaded one: the panel carries no hero scale token, so
 * the derivation that keyed on that token could not see it, and the sweep that
 * used the same token never asked for the route.
 */
const AUTH_ROUTES = (() => {
  const found = []
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page.tsx' && /<AuthShell[\s/>]/.test(readFileSync(full, 'utf8'))) {
        found.push(
          full
            .replace(/\\/g, '/')
            .replace(/^src\/app/, '')
            .replace(/\/page\.tsx$/, '')
            .replace(/\/\([^/]+\)/g, '') || '/',
        )
      }
    }
  }
  walk('src/app')
  if (found.length < 3) {
    console.error(`[hero-contrast] BROKEN DRIVE: only ${found.length} <AuthShell> route(s) found under src/app (expected >= 3).`)
    process.exit(1)
  }
  return found.sort()
})()
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
  /* The auth brand panel, added 20 September 2026 when the derivation stopped
   * keying on the hero scale token. It paints the wordmark and two taglines on
   * a photograph at lg and wider, on every sign-in, sign-up, password-reset and
   * verification page, and nothing had ever measured it. */
  ...AUTH_ROUTES,
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
  /* The auth brand panel, added 20 September 2026 with the second derivation.
   * Any one of the five <AuthShell> routes renders it; the sweep loads all of
   * them because AUTH_ROUTES is enumerated, not chosen. */
  'src/components/auth/auth-shell.tsx': '/login',
  /* The community organiser CTA band, which renders under every community
   * page and was measured for the first time on 20 September 2026. */
  'src/components/features/community/community-organiser-cta.tsx': '/community/',
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
  /* ── Added 20 September 2026 with the second derivation ──────────────────
   *
   * Each of these paints text over a photograph and each is listed here with
   * the reason no URL in this sweep reaches it, rather than being quietly
   * absent, which is how the first nine stayed invisible. Every one of them is
   * held instead by the wash's own arithmetic, which
   * `hero-text-over-a-photograph.mjs` clause 2 recomputes on every build.
   */
  /* Its slugs are database rows, like the event family. It IS driven, by
   * --routes-file, and the run that reports ZERO photographic text surfaces on
   * it at all three widths is the evidence behind its register entry. */
  'src/components/features/organisers/organiser-profile-hero.tsx',
  /* Also row-derived, and on TEST not one of the 49 venue rows carries a cover
   * image, so all 49 pages render <BrandedPlaceholder> and the photographic
   * branch has no URL that exercises it. */
  'src/components/features/venues/venue-profile-hero.tsx',
  /* /artists and /gigs are gated on `artist_showcase` and `gig_board`, both
   * false in BROADCAST_FLAG_DEFAULTS, so both answer 404. */
  'src/components/marketplace/marketplace-hero.tsx',
  /* Behind organiser auth, and needs a published event. This sweep runs against
   * public URLs. */
  'src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx',
  /* Needs a live queue for an event that is actually queueing. */
  'src/app/queue/[slug]/queue-room.tsx',
  /* Needs a squad invitation token, which exists only once somebody has made
   * one. */
  'src/app/squad/[token]/page.tsx',
  /* Nothing in src imports it. */
  'src/components/features/home/split-state-hero.tsx',
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
const derivedHeroes = derivePhotographicTextSurfaces().map(x => x.file)
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

/* ── WHICH SURFACES PAINT TEXT ON A PHOTOGRAPH, DERIVED FROM THE DOM ───────
 *
 * THE INCIDENT, 20 September 2026, the second one. The first version of this
 * file found its bands with `:is(.hero-marketing, .hero-marketing-grow)` and
 * `hero-files.mjs` derived its file list from the same token, and both said so
 * in their own headers: derived, not listed. They ARE derived. The token is the
 * wrong thing to derive from, and the platform's own constitution says so in
 * the same paragraph that locks it: "The two profile heroes (venue, organiser)
 * keep their own inline scale". A derivation whose mark the law carves
 * exceptions out of has those exceptions as blind spots, and nothing about it
 * looks any different from a derivation with none.
 *
 * Six surfaces paint text on a photograph without that token: the auth brand
 * panel behind every sign-in and sign-up, the /about story band, the community
 * organiser band, the venue profile banner, the queue room backdrop, and the
 * city and community tiles. Not one had ever been measured by anything.
 *
 * SO THE DERIVATION ASKS THE PAGE, NOT THE SOURCE. A photograph is a painted
 * photograph: an `<img>` that has decoded, or an element whose computed
 * `background-image` resolves a `url()`. No class, no component name, no
 * import: a surface cannot avoid this by being written differently, and the
 * organiser banner, which paints its cover through a CSS `background-image`
 * and therefore renders no media component at all, is found by the same rule
 * as the homepage hero.
 *
 * WHETHER THE PHOTOGRAPH IS ACTUALLY BEHIND THE TEXT IS HIT-TESTED, NOT
 * INFERRED FROM OVERLAP. Rectangle overlap alone reported the mobile bottom
 * navigation as text on a photograph, because the fixed bar happens to cover a
 * card image it has nothing to do with, and the same for the consent dialog.
 * `elementsFromPoint` is the browser's own stacking answer: the photograph must
 * be UNDER the run at that point with nothing FULLY OPAQUE between them. A
 * translucent pill (`bg-ink-900/95`) is not opaque and stays in, because the
 * photograph genuinely shows through it and the reader genuinely receives the
 * composite.
 */
const PHOTO_MIN_EDGE = 24

/** Tag every painted photograph on the page, in document order. Returns the count. */
const tagPhotos = page =>
  page.evaluate(min => {
    for (const stale of document.querySelectorAll('[data-photo]')) stale.removeAttribute('data-photo')
    let n = 0
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue
      const r = el.getBoundingClientRect()
      if (r.width < min || r.height < min) continue
      const decoded = el.tagName === 'IMG' && el.complete && el.naturalWidth > 0
      const painted = /url\(/.test(cs.backgroundImage)
      if (!decoded && !painted) continue
      el.setAttribute('data-photo', String(n))
      n += 1
    }
    return n
  }, PHOTO_MIN_EDGE)

/**
 * For photograph `idx`, already scrolled into view: the text runs genuinely
 * painted over it, and the band that holds both. Tags the band
 * `data-photo-band="<key>"` and returns what it found.
 */
const bandForPhoto = (page, idx, key) =>
  page.evaluate(
    ({ i, k }) => {
      const photo = document.querySelector(`[data-photo="${i}"]`)
      if (!photo) return null
      const pr = photo.getBoundingClientRect()
      const vis = el => {
        const cs = getComputedStyle(el)
        return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) >= 0.05
      }
      const opaque = el => {
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)
        if (!m) return false
        const parts = m[1].split(',').map(v => parseFloat(v))
        return parts.length < 4 || parts[3] >= 0.99
      }
      const runs = []
      for (const el of document.querySelectorAll('*')) {
        if (photo.contains(el) || el.contains(photo)) continue
        const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim()
        if (!own || !vis(el)) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        const cx = Math.round(r.left + r.width / 2)
        const cy = Math.round(r.top + r.height / 2)
        if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue
        const stack = document.elementsFromPoint(cx, cy)
        const iRun = stack.findIndex(n => n === el || n.contains(el))
        const iPhoto = stack.indexOf(photo)
        if (iRun < 0 || iPhoto < 0 || iRun >= iPhoto) continue
        if (stack.slice(iRun + 1, iPhoto).some(opaque)) continue
        runs.push(el)
      }
      if (runs.length === 0) return { runs: 0 }
      /* THE BAND IS THE NEAREST COMMON ANCESTOR of the photograph and every run
       * over it, computed rather than named, so a hero section, a tile anchor
       * and a whole-page backdrop are each found at their own true extent. */
      let band = photo
      while (band && !runs.every(r => band.contains(r))) band = band.parentElement
      if (!band) return { runs: 0 }
      /*
       * A SLIDE OF A CAROUSEL IS MEASURED AS THE CAROUSEL.
       *
       * THE REGRESSION THIS FIXES, and it was caught by counting the checks in
       * a green sweep rather than by anything going red. The band used to be
       * found by the hero scale class, which sits on the carousel; the common
       * ancestor of a photograph and the words over it is the SLIDE. The dots
       * are a sibling of the slide, so slide discovery found no tablist, the
       * drive measured one photograph of five, and the homepage printed 12
       * green checks where it had printed 60. Smaller, greener, and silent -
       * which is exactly the failure the slide walk was built to end.
       *
       * Pressing a dot also swaps which slide is in layout, so a tag left on
       * one slide addresses a hidden element for every press after the first.
       * Tagging the carousel fixes both at once.
       */
      /*
       * AND A TABLIST IS NOT A CAROUSEL, which cost 30 FAILs before it was
       * right. The test above used to be "an ancestor containing more than one
       * [role=tab]", and on /city/[slug] the date filter is a sticky
       * `role="tablist"` of five chips that navigates the router. The nearest
       * ancestor of a tile band that also contains those chips is most of the
       * page, so the band became the page, the walk pressed "This weekend"
       * expecting a slide, and every route rendering CityLandingPage,
       * SuburbLandingPage or CommunityCityLandingPage reported four slides it
       * "could not reach" at all three viewports. The product was fine.
       *
       * A carousel says what it is, in the product's own markup and in the
       * WAI-ARIA authoring practice the carousel was built to:
       * `aria-roledescription="carousel"`. That is now the test, and the tab
       * count stays beside it so a region that claims to be a carousel and
       * offers no way to move through it is still not taken.
       */
      for (let up = band.parentElement; up; up = up.parentElement) {
        if (
          up.getAttribute('aria-roledescription') === 'carousel' &&
          up.querySelectorAll('[role="tab"]').length > 1
        ) {
          band = up
          break
        }
        if (up === document.body) break
      }
      if (band.hasAttribute('data-photo-band')) return { runs: runs.length, sharedWith: band.getAttribute('data-photo-band') }
      band.setAttribute('data-photo-band', String(k))
      return {
        runs: runs.length,
        tagged: String(k),
        band: band.tagName.toLowerCase() + (band.id ? `#${band.id}` : ''),
        photo: photo.tagName === 'IMG' ? 'img' : 'background-image',
        rect: { w: Math.round(pr.width), h: Math.round(pr.height) },
      }
    },
    { i: idx, k: key },
  )

/** Address a derived band by the key it was tagged with, never by position. */
const bandSel = key => `[data-photo-band="${key}"]`

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
async function discoverSlides(page, sel) {
  return page.evaluate(
    s => {
      const el = document.querySelector(s)
      if (!el) return { count: 1, labels: [] }
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      return { count: Math.max(1, tabs.length), labels: tabs.map(t => t.getAttribute('aria-label') ?? '') }
    },
    sel,
  )
}

/** Press slide `idx` and wait until the component reports it selected and its raster has decoded. */
async function selectSlide(page, sel, idx) {
  await page.evaluate(
    ({ s, n }) => {
      const el = document.querySelector(s)
      ;[...el.querySelectorAll('[role="tab"]')][n]?.click()
    },
    { s: sel, n: idx },
  )
  await page.waitForFunction(
    ({ s, n }) => {
      const el = document.querySelector(s)
      if (!el) return false
      const tabs = [...el.querySelectorAll('[role="tab"]')]
      if (tabs[n]?.getAttribute('aria-selected') !== 'true') return false
      /* THIS BAND'S photographs, not the page's. Widening it to the document
       * was tried and hangs: a homepage carries 10 to 27 images and the ones
       * below the fold are lazy, so they never report complete and every press
       * after the first timed out at 30 seconds. The band is the carousel, so
       * its own images are exactly the slides'. */
      const live = [...el.querySelectorAll('img')].filter(i => {
        const r = i.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })
      return live.length > 0 && live.every(i => i.complete && i.naturalWidth > 0)
    },
    { s: sel, n: idx },
    { timeout: 30000 },
  )
  /* The crossfade is a 700ms eased opacity transition (FeaturedHeroClient).
   * Measuring inside it would measure two photographs at once. */
  await page.waitForTimeout(900)
}

const rows = []
/** Bands found per route, summed over viewports. A route at zero everywhere is judged. */
const bandsByRoute = new Map()
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

      /*
       * EVERY PHOTOGRAPH MUST BE MADE TO EXIST BEFORE ANY OF THEM IS JUDGED,
       * AND UNTIL 20 SEPTEMBER 2026 MOST OF THEM NEVER WERE.
       *
       * The wait below is necessary and was not sufficient, and the two are
       * easy to confuse because the insufficient version passes instantly. A
       * lazy `<img>` that the browser has not fetched is not an incomplete
       * image, it is an image with no work outstanding, so "every img is
       * complete" is TRUE on a page whose rails have not loaded a single
       * picture. The condition was satisfied by the absence of the thing it
       * was written to wait for.
       *
       * MEASURED, on /city/sydney, both at 768 and at 1440: three photographs
       * found at load, twenty-six decoded once the page had been scrolled. The
       * twenty-one community tiles of the "Sydney by community" rail - a rail
       * that paints a name and a city line on a photograph, which is precisely
       * this drive's subject - were never measured by any sweep this file has
       * ever produced. Nothing reported a gap, because a photograph that is
       * never tagged yields no band, a band that does not exist yields no run,
       * and a run that does not exist cannot fail. The sweep simply came back
       * smaller, which in a summary line is indistinguishable from good news.
       *
       * So the page is walked first, vertically and then through every
       * horizontal scroller, which is what a reader's scroll does and what the
       * IntersectionObserver behind `loading="lazy"` is waiting for. Only then
       * is the wait below meaningful, because by then the images it asks about
       * are images that have actually been asked for.
       */
      await page.evaluate(async () => {
        const settle = () => new Promise(r => setTimeout(r, 60))
        for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) {
          window.scrollTo(0, y)
          await settle()
        }
        window.scrollTo(0, document.body.scrollHeight)
        await settle()
        /* A rail's tiles past the right edge are lazy for the same reason its
         * rows below the fold are, and `scrollIntoView` on a photograph cannot
         * help: the photograph does not exist yet. */
        for (const el of document.querySelectorAll('*')) {
          if (el.scrollWidth <= el.clientWidth + 4) continue
          const back = el.scrollLeft
          for (let x = 0; x < el.scrollWidth; x += Math.round(el.clientWidth * 0.8) || 200) {
            el.scrollLeft = x
            await settle()
          }
          el.scrollLeft = back
        }
        window.scrollTo(0, 0)
        await settle()
      })

      /* NOW the wait means what it says: every photograph the page will ever
       * paint has been requested, so "complete with intrinsic width" is a
       * statement about pictures rather than about their absence. */
      await page.waitForFunction(
        () => [...document.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 30000 },
      ).catch(() => {})
      await page.waitForTimeout(400)

      /*
       * DERIVE THE SURFACES. Each photograph is brought into view before it is
       * hit-tested, because `getBoundingClientRect` and `elementsFromPoint` are
       * both viewport-relative and a band below the fold answers "nothing is
       * over this photograph" for the same reason a band off-screen yields no
       * pixels. The /about story band was invisible to the first version of
       * this derivation for exactly that reason and it is the surface the
       * derivation was written to find.
       */
      const photoCount = await tagPhotos(page)
      const bands = []
      for (let p = 0; p < photoCount; p += 1) {
        await page.evaluate(i => document.querySelector(`[data-photo="${i}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' }), p)
        await page.waitForTimeout(80)
        const found = await bandForPhoto(page, p, bands.length)
        if (found?.tagged) bands.push(found)
      }
      const bandCount = bands.length
      bandsByRoute.set(route, (bandsByRoute.get(route) ?? 0) + bandCount)
      if (bandCount === 0) {
        /*
         * NOT A FAILURE HERE, AND THE DISTINCTION COST A FALSE ACCUSATION.
         * The auth brand panel is `hidden lg:flex`, so at 390 and 768 there is
         * genuinely no photograph and genuinely nothing to measure. The first
         * version of this rule called that a product defect on four checks and
         * printed it in the same red as a 1.00:1 wordmark. A surface that is
         * deliberately absent at a width is absent, not broken.
         *
         * THE ANTI-FALSE-PASS SURVIVES, one level out: a route that yields no
         * photographic text surface at ANY viewport has stopped rendering the
         * thing this sweep exists to watch, and that IS judged, below.
         */
        console.log(`  [${pageId}] ${photoCount} photograph(s), none painting text over one`)
        await ctx.close()
        continue
      }
      console.log(`  [${pageId}] ${photoCount} photograph(s), ${bandCount} painting text over one`)

      for (let bandIdx = 0; bandIdx < bandCount; bandIdx += 1) {
      const heroSel = bandSel(bandIdx)
      /* A band below the fold has to be brought into the viewport before it is
       * screenshotted: the captures are viewport-sized and every run rectangle
       * is in viewport coordinates, so an off-screen band yields no pixels at
       * all, which the drive would otherwise report as "the run is invisible". */
      await page.evaluate(
        s => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }),
        heroSel,
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
          s => {
            const band = document.querySelector(s)
            if (!band) return false
            const settled = el => {
              const cs = getComputedStyle(el)
              const t = cs.transform
              return Number(cs.opacity) > 0.99 && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)')
            }
            if (!settled(band)) return false
            return [...band.querySelectorAll('*')].every(settled)
          },
          heroSel,
          { timeout: 15000 },
        )
        .catch(() => {})
      await page.waitForTimeout(250)

      const slides = await discoverSlides(page, heroSel)
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
      const runs = await page.evaluate(sel => {
        const band = document.querySelector(sel)
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
        /*
         * THE PHOTOGRAPHS OF THIS BAND, RE-READ NOW. A carousel changes its
         * picture between slides, so the photograph a run sits on is not the
         * one the band was derived from, and asking again is the only way to
         * measure the slide that is actually showing.
         */
        const photos = [...band.querySelectorAll('*'), band].filter(el => {
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false
          const r = el.getBoundingClientRect()
          if (r.width < 24 || r.height < 24) return false
          const decoded = el.tagName === 'IMG' && el.complete && el.naturalWidth > 0
          return decoded || /url\(/.test(cs.backgroundImage)
        })
        const opaque = el => {
          const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)
          if (!m) return false
          const parts = m[1].split(',').map(v => parseFloat(v))
          return parts.length < 4 || parts[3] >= 0.99
        }
        /* A run is over a photograph when the browser's own stacking puts one
         * of this band's photographs under it with nothing fully opaque
         * between. Text that merely sits INSIDE the band - a card title below
         * its image, a trust pillar under an empty state - is not text on a
         * photograph and is not this sweep's business. */
        const overAPhotograph = el => {
          const r = el.getBoundingClientRect()
          const cx = Math.round(r.left + r.width / 2)
          const cy = Math.round(r.top + r.height / 2)
          if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return false
          const stack = document.elementsFromPoint(cx, cy)
          const iRun = stack.findIndex(n => n === el || n.contains(el))
          if (iRun < 0) return false
          for (const ph of photos) {
            if (ph.contains(el)) continue
            const iPhoto = stack.indexOf(ph)
            if (iPhoto < 0 || iRun >= iPhoto) continue
            if (stack.slice(iRun + 1, iPhoto).some(opaque)) continue
            return true
          }
          return false
        }
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
          if (!overAPhotograph(el)) continue
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
      }, heroSel)

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
            await selectSlide(page, heroSel, s)
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
 * A ROUTE THAT PAINTS TEXT ON A PHOTOGRAPH AT NO WIDTH AT ALL has either lost
 * its photograph or lost its text, and either way this sweep has stopped
 * watching it while continuing to report on it. That is the failure mode the
 * whole file exists to prevent, so it is judged per route rather than per
 * viewport, which is what lets a `hidden lg:flex` panel be absent at 390
 * without being called broken.
 */
for (const route of TARGETS) {
  /* Only routes this drive DERIVED are judged. A list handed in with
   * --routes-file is an ad-hoc question - "what does this organiser page paint
   * over its cover?" - and ZERO is a legitimate answer to it, which is exactly
   * the answer that became the evidence for two register entries. Asserting on
   * a handed-in list would turn that evidence into a failure. */
  if (FROM_FILE.length) break
  if ((bandsByRoute.get(route) ?? 0) === 0) {
    check(`${route} coverage`, false, 'no text over a photograph at any of the three viewports')
  }
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
