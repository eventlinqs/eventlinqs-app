/**
 * A MARKETING BAND IS ONLY AS SHARP AS THE RASTER BEHIND IT, AND EVERY BAND IS
 * MEASURED BY THE DRIVE (lane B, 19 September 2026).
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY THE EXISTING GATES ALL PASSED THE DEFECT
 * ============================================================================
 *
 * `MarketingMedia` had one variant called `band` and THREE layouts wore it: a
 * half-column feature band, a full-content-column offer band, and a full-bleed
 * story band. One `sizes` string cannot be right for three widths, and two of
 * the three were UNDER-fetched, so the bands on /organisers and /about rendered
 * blurry at every desktop width. Driven at nine viewports at DPR 2 on
 * 19 September 2026 (`C:\dev\EVIDENCE\LB-BANDS\before-drive.txt`):
 *
 *     /organisers 1280   a 1214px band needed 2428, the browser chose 1920  x0.79
 *     /organisers 1440   a 1334px band needed 2668, the browser chose 1920  x0.72
 *     /about      1920   a 1920px band needed 3840, the browser chose 1920  x0.50
 *
 * Every gate was green while that was true, and the reason is that NOTHING
 * LOOKED. `image-hints-match-the-cell.mjs` says in its own header that it
 * cannot judge a grid or a band, and `image-hint-fidelity-drive.mjs` can, but
 * /organisers and /about WERE NOT IN ITS ROUTE LIST. The marketing surfaces
 * every outreach message points a stranger at were the ones nothing measured.
 * Clause 1 is that hole, closed.
 *
 * ============================================================================
 * AND THE HALF THE DRIVE STILL CANNOT SEE, WHICH IS WHY CLAUSE 3 EXISTS
 * ============================================================================
 *
 * The fidelity drive compares the width the browser REQUESTED with the slot it
 * landed in. It never opens the bytes that came back, so it cannot see that the
 * origin file caps out below the request. Measured on the same tree after the
 * hints were split, by fetching each optimiser URL and reading the returned
 * image (`C:\dev\EVIDENCE\LB-BANDS\delivered-pixels.txt`):
 *
 *     /organisers   636px slot  needs 1272  delivered 1920x1280  SHARP
 *     /organisers  1334px slot  needs 2668  delivered 1920x1280  SOFT x0.72
 *     /about       1920px slot  needs 3840  delivered 1920x1280  SOFT x0.50
 *
 * So the drive reports 16 of 16 PASS over two bands that are still soft. The
 * ceiling is `ROLE_WIDTH.hero` in `src/lib/images/spine.ts`, which is 1920 and
 * is the ingest floor for the whole licensed library. No hint can raise it and
 * Law 6 forbids inventing the pixels, so the fix is a larger licensed
 * rendition, which is the owner's. That is recorded in
 * C:\dev\REVIEW-QUEUE-B.md rather than hidden behind a green gate.
 *
 * ============================================================================
 * WHY THE REGISTER, RATHER THAN SIMPLY FAILING
 * ============================================================================
 *
 * A guard that cannot go green is a guard somebody switches off, and the two
 * soft bands cannot be fixed from this repository today. So they are NAMED,
 * with a date and a reason, in the same shape `initial-bundle-budget.mjs` uses
 * for its over-budget routes. The register is not a mute button:
 *
 *   - a band that goes soft and is NOT in it fails the build;
 *   - an entry that loses its reason or its date fails the build;
 *   - an entry that is no longer soft, because the raster ceiling rose, fails
 *     the build until it is deleted, so the register cannot outlive the defect.
 *
 * ============================================================================
 * THE TILE, WHICH THIS GUARD USED TO SAY IT COULD NOT SEE (19 September 2026)
 * ============================================================================
 *
 * This header carried a paragraph saying it judged the bands and NOT `tile`,
 * "whose one call site is behind a login that no drive signs in to, so no number
 * about it is claimed here or anywhere else". That was honest and it was also a
 * hole, and the hole had a defect in it the whole time. `MEDIA_SIZES.featureTile`
 * claimed `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px`, which
 * describes a three-up public grid. Its call site is a HALF of the 1400px
 * dashboard column beside a sidebar. Driven at DPR 2 once the drive was taught
 * to sign in (`C:\dev\EVIDENCE\LB-TILE\before-drive.txt`):
 *
 *      640  a 540px slot needed 1080, the browser chose 640   x0.59
 *     1440  a 504px slot needed 1008, the browser chose 640   x0.64
 *      360  a 276px slot needed  552, the browser chose 384   x0.70
 *
 * Six of the nine viewports under-fetched. So the drive grew `AUTHED_PATHS`, the
 * variant is now named for its layout, and clause 1 requires a page rendering a
 * TILE to be in that authed list exactly as a page rendering a BAND must be in
 * the public one. A guard that names what it cannot see is better than one that
 * pretends; a guard that goes and looks is better than both.
 *
 * Exit 1 with every offending line, or exit 0 with the counts checked.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'
import { buildImportGraph, pathToTarget } from './lib/import-graph.mjs'

const MEDIA = 'src/components/media/MarketingMedia.tsx'
const SIZES = 'src/components/media/sizes.ts'
const SPINE = 'src/lib/images/spine.ts'
const DRIVE = 'scripts/verify/image-hint-fidelity-drive.mjs'

const failures = []
const fail = (where, message) => failures.push(`${where}\n    ${message}`)

/** Read a file, or say out loud that it could not be read. A guard that cannot
 *  read its subject has not passed, it has failed to look. */
function read(rel) {
  try {
    return readFileSync(rel, 'utf8')
  } catch (err) {
    fail(rel, `could not be read (${err.code ?? err.message}), so nothing below was judged`)
    return null
  }
}

/**
 * THE CAPPED SLOT OF EACH MARKETING LAYOUT, IN CSS PIXELS, AND WHERE IT COMES
 * FROM.
 *
 * Each number is stated twice on purpose, here and as the fixed term of the
 * hint in sizes.ts, because neither can be generated from the other: a hint is
 * a media-query string a browser parses, and this is arithmetic over the
 * container. Clause 2 compares them, so moving one without the other stops the
 * build naming both lines.
 *
 * `band-full-bleed` has no fixed term to compare, because it has no cap: it is
 * as wide as the viewport. Its slot is therefore the widest viewport the
 * fidelity drive claims the contract at, read out of the drive rather than
 * written here, so widening the drive widens this too.
 *
 * `surface` says WHICH route list clause 1 requires the layout's pages to be in.
 * A public band belongs in the drive's default paths; the dashboard tile belongs
 * in its AUTHED_PATHS, and requiring it in the public list is what the first
 * draft of clause 1 did, which was the guard being wrong about the page.
 *
 * `raster` says WHOSE pixels sit behind the layout, because clause 3 judges a
 * slot against the licensed library's ingest ceiling and that question is only
 * meaningful where the library supplies the image. A `null` raster must carry a
 * `rasterWhy`, so an exclusion from clause 3 is a named decision rather than a
 * quiet gap, which is the same rule SOFT_REGISTER lives under.
 */
const LAYOUT_SLOTS = {
  'band-half-column': {
    capped: 640,
    surface: 'public',
    raster: 'library',
    why: '1400px container less 64px padding is 1336px of content, less the 64px gap, halved, rounded up',
  },
  'band-full-column': {
    capped: 1340,
    surface: 'public',
    raster: 'library',
    why: '1400px container less 64px padding is 1336px of content, rounded up',
  },
  'band-full-bleed': {
    capped: null,
    surface: 'public',
    raster: 'library',
    why: 'no cap: the band is the viewport, so the drive\'s widest viewport is the slot',
  },
  'tile-dashboard-half-column': {
    capped: 640,
    surface: 'authed',
    raster: null,
    why: 'the DASHBOARD container is 1400px of content, because its padding sits on <main> OUTSIDE the max-w-7xl unlike every public container, less the 24px gap, halved, less the 52px the card spends on two 1px borders and px-6: 636, rounded up',
    rasterWhy: 'an ORGANISER-SUPPLIED event cover sits behind this tile rather than a licensed library raster, so the library ingest ceiling is not the ceiling over it and judging it against one would be judging the wrong file. Law 6 governs what may be done with it: render what was supplied, never invent pixels it does not have.',
  },
}

/** A retina screen needs two physical pixels per CSS pixel, which is the DPR
 *  the fidelity drive measures at. */
const DPR = 2

/**
 * THE SOFT BANDS, NAMED WITH THE DATE AND THE REASON. Delete an entry the day
 * its raster can supply it; the guard fails if one is left behind.
 */
const SOFT_REGISTER = [
  {
    variant: 'band-full-column',
    since: '2026-09-19',
    why: 'the Founding Organiser band renders 1336px wide, so a 2x screen needs 2672 physical pixels and the hero raster ceiling is 1920. A larger licensed rendition is the owner\'s; Law 6 forbids inventing the pixels.',
  },
  {
    variant: 'band-full-bleed',
    since: '2026-09-19',
    why: 'the /about story band is the full viewport, so a 2x screen at 1920 needs 3840 physical pixels and the hero raster ceiling is 1920. Same owner action, same law.',
  },
]

// ── Clause 1: every route that renders a band is measured by the drive ───────
const graph = buildImportGraph()
const pages = graph.files
  .map(f => f.replaceAll('\\', '/').replace(/\.(tsx?)$/, ''))
  .filter(id => /^src\/app\/.*\/page$/.test(id) || id === 'src/app/page')

/** `src/app/(dashboard)/dashboard/x/page` -> `/dashboard/x`. Route groups are
 *  parentheses and carry no path segment. */
const routeOf = id =>
  '/' +
  id
    .replace(/^src\/app\//, '')
    .replace(/\/?page$/, '')
    .split('/')
    .filter(seg => seg && !/^\(.*\)$/.test(seg))
    .join('/')

const driveSrc = read(DRIVE)
let drivePaths = []
let authedPaths = []
let driveWidths = []
if (driveSrc) {
  const listed = /const rawPaths[\s\S]*?\?\s*rawPaths\s*:\s*\[([^\]]*)\]/.exec(driveSrc)
  if (!listed) {
    fail(DRIVE, 'the default route list could not be found, so clause 1 judged nothing. It is the `["home", ...]` literal beside `rawPaths`.')
  } else {
    drivePaths = [...listed[1].matchAll(/'([^']+)'/g)].map(m => (m[1] === 'home' ? '/' : `/${m[1]}`))
  }
  /* The authed list is already in route form, dynamic segments and all, so that
     it can be compared with what routeOf() derives from the app directory
     without either side reformatting the other.
     THE CLOSING BRACKET IS FOUND BY THE LINE BREAK AFTER IT, not by being the
     first `]`, because a Next.js dynamic segment IS a pair of brackets: the
     first draft used `[^\]]*` and captured up to the `]` in `[id]`, which parsed
     to an empty list. It did not fail quietly, and that is worth recording: the
     declareWork zero-work clause refused the run with "authed route measured by
     the fidelity drive came back zero" before any human read the output. */
  const authed = /const AUTHED_PATHS\s*=\s*\[([\s\S]*?)\]\s*(?:\r?\n|$)/.exec(driveSrc)
  if (!authed) {
    fail(DRIVE, 'the AUTHED_PATHS list could not be found, so no tile-bearing route was judged. It is the `["/dashboard/..."]` literal.')
  } else {
    authedPaths = [...authed[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  }
  const widths = /const WIDTHS\s*=\s*\[([^\]]*)\]/.exec(driveSrc)
  if (!widths) {
    fail(DRIVE, 'the WIDTHS list could not be found, so the full-bleed slot could not be read and clause 3 judged nothing.')
  } else {
    driveWidths = [...widths[1].matchAll(/\d+/g)].map(m => Number(m[0]))
  }
}

/*
 * A page that imports MarketingMedia is not necessarily a page with a BAND on
 * it, so the subjects are the files that actually DECLARE a variant, and the
 * pages that reach them. The first draft of this clause walked to the component
 * instead and named the organiser launch kit for rendering a tile; that was the
 * guard being wrong about the page, not the page being wrong.
 *
 * The launch kit IS now a subject, on the other list. A tile is measured behind
 * a login, so its route belongs in the drive's AUTHED_PATHS, and requiring it in
 * the public list would be requiring a measurement nobody can take.
 */
function declarersOf(marker) {
  return graph.files
    .map(f => f.replaceAll('\\', '/'))
    .filter(f => marker.test(readFileSync(f, 'utf8')))
    .map(f => f.replace(/\.(tsx?)$/, ''))
}

function pagesReaching(users) {
  return pages.filter(page => users.some(user => page === user || pathToTarget(graph, page, user, new Map())))
}

const bandUsers = declarersOf(/variant="band-/)
const tileUsers = declarersOf(/variant="tile-/)

if (!bandUsers.length) {
  fail(MEDIA, 'no file in src/ declares a band variant, so clause 1 judged nothing. Either every band is gone or the marker moved.')
}
if (!tileUsers.length) {
  fail(MEDIA, 'no file in src/ declares a tile variant, so the authed half of clause 1 judged nothing. Either the tile is gone or the marker moved.')
}

const bandPages = pagesReaching(bandUsers)
const tilePages = pagesReaching(tileUsers)

for (const page of bandPages) {
  const route = routeOf(page)
  if (!drivePaths.includes(route)) {
    fail(
      `${page}.tsx`,
      `renders a marketing band on ${route}, and ${route} is not in the default route list of ${DRIVE}.\n` +
        `    That is exactly how /organisers and /about came to ship blurry bands with every gate green.\n` +
        `    Add '${route === '/' ? 'home' : route.slice(1)}' to that list.`,
    )
  }
}
for (const page of tilePages) {
  const route = routeOf(page)
  if (!authedPaths.includes(route)) {
    fail(
      `${page}.tsx`,
      `renders a marketing tile on ${route}, and ${route} is not in AUTHED_PATHS in ${DRIVE}.\n` +
        `    A tile behind a login is exactly the surface that kept its wrong hint for months, because\n` +
        `    nothing could reach it. Add '${route}' to AUTHED_PATHS and let the drive sign in and measure it.`,
    )
  }
}

// ── Clause 2: one hint per band layout, and the numbers agree ────────────────
const mediaSrc = read(MEDIA)
const sizesSrc = read(SIZES)
let variants = []
let mapped = new Map()
if (mediaSrc) {
  // `\n\n` alone does not match a CRLF blank line, and this tree is checked out
  // with CRLF. The first draft read the union as absent and said so, which is
  // the correct direction to fail in but the wrong reason.
  const union = /export type MarketingMediaVariant\s*=([\s\S]*?)\n\s*\n/.exec(mediaSrc)
  if (!union) {
    fail(MEDIA, 'the MarketingMediaVariant union could not be found, so clause 2 judged nothing.')
  } else {
    variants = [...union[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  }
  const table = /const SIZES_BY_VARIANT[\s\S]*?\{([\s\S]*?)\n\}/.exec(mediaSrc)
  if (!table) {
    fail(MEDIA, 'the SIZES_BY_VARIANT table could not be found, so clause 2 judged nothing.')
  } else {
    for (const m of table[1].matchAll(/'?([A-Za-z-]+)'?\s*:\s*MEDIA_SIZES\.([A-Za-z0-9_]+)/g)) {
      mapped.set(m[1], m[2])
    }
  }
}

const seenHints = new Map()
for (const [variant, hint] of mapped) {
  if (seenHints.has(hint)) {
    fail(
      MEDIA,
      `variants '${seenHints.get(hint)}' and '${variant}' both read MEDIA_SIZES.${hint}.\n` +
        '    One hint cannot be right for two layouts. That is the fault this guard exists for.',
    )
  }
  seenHints.set(hint, variant)
}
for (const variant of variants) {
  if (!mapped.has(variant)) {
    fail(MEDIA, `variant '${variant}' has no entry in SIZES_BY_VARIANT, so it renders a full candidate list at runtime.`)
  }
}

let slotsCompared = 0
if (sizesSrc) {
  for (const [variant, declared] of Object.entries(LAYOUT_SLOTS)) {
    if (declared.capped === null) continue
    const key = mapped.get(variant)
    if (!key) {
      fail(MEDIA, `variant '${variant}' is declared in this guard's LAYOUT_SLOTS and is not mapped to a hint.`)
      continue
    }
    const hint = new RegExp(`\\b${key}:\\s*'([^']+)'`).exec(sizesSrc)
    if (!hint) {
      fail(SIZES, `MEDIA_SIZES.${key} could not be read, so the capped slot of '${variant}' was not compared.`)
      continue
    }
    const fixed = /(\d+)px\s*$/.exec(hint[1].trim())
    if (!fixed) {
      fail(SIZES, `MEDIA_SIZES.${key} does not end in a fixed pixel term, so above the container cap a vw term keeps growing while the slot does not.`)
      continue
    }
    slotsCompared += 1
    if (Number(fixed[1]) !== declared.capped) {
      fail(
        SIZES,
        `MEDIA_SIZES.${key} ends in ${fixed[1]}px and '${variant}' is declared here as ${declared.capped}px.\n` +
          `    ${declared.why}. Move both or neither.`,
      )
    }
  }
}

// ── Clause 3: a band is supplyable, or it is named with its reason ───────────
const spineSrc = read(SPINE)
let ceiling = null
if (spineSrc) {
  const hero = /ROLE_WIDTH[\s\S]*?hero:\s*(\d+)/.exec(spineSrc)
  if (!hero) {
    fail(SPINE, 'ROLE_WIDTH.hero could not be read, so no band was judged against the raster ceiling.')
  } else {
    ceiling = Number(hero[1])
  }
}

const widest = driveWidths.length ? Math.max(...driveWidths) : null
const registered = new Map(SOFT_REGISTER.map(e => [e.variant, e]))
let bandsJudged = 0
const stillSoft = new Set()

if (ceiling !== null && widest !== null) {
  for (const [variant, declared] of Object.entries(LAYOUT_SLOTS)) {
    /* A layout whose pixels are not the library's is not judged against the
       library's ceiling. It must say so in `rasterWhy`, which is checked below
       with the register, so the skip is a sentence somebody wrote rather than a
       branch nobody noticed. */
    if (declared.raster === null) continue
    const slot = declared.capped ?? widest
    const needs = slot * DPR
    bandsJudged += 1
    const soft = needs > ceiling
    if (soft) stillSoft.add(variant)
    const entry = registered.get(variant)
    if (soft && !entry) {
      fail(
        MEDIA,
        `band '${variant}' renders ${slot}px, so a ${DPR}x screen needs ${needs} physical pixels and the raster ceiling is ${ceiling}.\n` +
          `    It is SOFT and it is not in this guard's SOFT_REGISTER. Either point it at a layout the library can supply,\n` +
          '    or add it with a date and the reason, so the softness is a named decision rather than a silent one.',
      )
    }
    if (!soft && entry) {
      fail(
        'scripts/guards/marketing-bands-are-supplyable.mjs',
        `SOFT_REGISTER still names '${variant}', and it needs ${needs} physical pixels against a ceiling of ${ceiling}, so it is no longer soft.\n` +
          '    Delete the entry in the same commit that raised the ceiling; a register that outlives its defect is a mute button.',
      )
    }
  }
}
for (const entry of SOFT_REGISTER) {
  if (!LAYOUT_SLOTS[entry.variant]) {
    fail('scripts/guards/marketing-bands-are-supplyable.mjs', `SOFT_REGISTER names '${entry.variant}', which is not a layout in LAYOUT_SLOTS.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.since ?? '')) {
    fail('scripts/guards/marketing-bands-are-supplyable.mjs', `the SOFT_REGISTER entry for '${entry.variant}' carries no dated \`since\`, so nobody can tell how long it has stood.`)
  }
  if (!entry.why || entry.why.trim().length < 40) {
    fail('scripts/guards/marketing-bands-are-supplyable.mjs', `the SOFT_REGISTER entry for '${entry.variant}' carries no reason, and an unexplained exemption is indistinguishable from a forgotten one.`)
  }
}

/* A layout excluded from clause 3 must say whose pixels it renders instead.
   Without this the `raster: null` line is a silent opt-out, which is the exact
   shape of the hole this guard's header used to describe about the tile. */
let unjudgedRasters = 0
for (const [variant, declared] of Object.entries(LAYOUT_SLOTS)) {
  if (declared.raster !== null) continue
  unjudgedRasters += 1
  if (!declared.rasterWhy || declared.rasterWhy.trim().length < 40) {
    fail(
      'scripts/guards/marketing-bands-are-supplyable.mjs',
      `LAYOUT_SLOTS['${variant}'] is excluded from the raster-ceiling clause with no \`rasterWhy\`.\n` +
        '    An excluded layout must name whose pixels it renders and why the library ceiling is the wrong question,\n' +
        '    or the exclusion is indistinguishable from an oversight.',
    )
  }
}

declareWork('marketing-bands-are-supplyable', {
  did: {
    'page swept for a marketing band or tile': pages.length,
    'page that renders a band': bandPages.length,
    'page that renders a tile': tilePages.length,
    'public route measured by the fidelity drive': drivePaths.length,
    'authed route measured by the fidelity drive': authedPaths.length,
    'variant mapped to its own hint': mapped.size,
    'capped slot compared with its hint': slotsCompared,
    'layout judged against the raster ceiling': bandsJudged,
    'layout excluded from the ceiling with a stated reason': unjudgedRasters,
  },
  found: { 'band or tile that no gate was watching': failures.length },
})

if (ceiling !== null && stillSoft.size) {
  console.log(
    `marketing-bands-are-supplyable: ${stillSoft.size} band(s) remain SOFT against a raster ceiling of ${ceiling}px ` +
      `(${[...stillSoft].join(', ')}), named with a reason in SOFT_REGISTER. The fix is a larger licensed rendition, which is the owner's.`,
  )
}

if (failures.length) {
  console.error('marketing-bands-are-supplyable: FAIL')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

console.log(
  `marketing-bands-are-supplyable: PASS - ${bandPages.length} band-bearing route(s) in the drive's public list and ` +
    `${tilePages.length} tile-bearing route(s) in its authed list, ${mapped.size} variant(s) each on their own hint, ` +
    `${bandsJudged} layout(s) judged against the ${ceiling}px ceiling and ${unjudgedRasters} excluded with a stated reason.`,
)
