/**
 * GUARD: a class list a component repeats per item is a composite utility, not
 * a string literal written out once per render.
 *
 * ============================================================================
 * WHY THIS EXISTS, with the measurement that produced it
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026, found by the
 * origin cost table. The served homepage document was 1,007,295 B and 34.9% of
 * it was `class` attribute values:
 *
 *     markup   class="..."      195,365 B   19.4% of the document
 *     flight   \"className\":   156,478 B   15.5% of the document
 *
 * across 131 distinct values of which 98 repeated. ONE value, 464 characters
 * long, shipped 104 times. It is paid TWICE - once in the markup and again in
 * the RSC payload - because a class list written as a string literal inside a
 * component is re-serialised for every instance React renders. Collapsing the
 * home card family's three lists into composite utilities in globals.css took
 * the homepage document to 850,054 B (-157,216 B, -15.6%) and its flight
 * payload from 368,851 to 290,192 B (-21.3%), with first-load JavaScript
 * unchanged to the byte and 726 computed style values identical either side.
 *
 * ============================================================================
 * WHAT THIS GUARD CAN AND CANNOT SEE, STATED FIRST
 * ============================================================================
 *
 * IT CANNOT SEE THE DOCUMENT THE DEFECT LIVED IN. The homepage is a DYNAMIC
 * route, so no file for it exists after a build; only 66 documents (11 .html
 * and 55 .rsc) are written, and the worst repeat cost among all of them is
 * 3,808 B. A guard that judged only built output would therefore have reported
 * a clean pass on the tree that carried a 96,512-byte defect.
 *
 * Saying that plainly is the point. The served-document half is covered by
 * `scripts/verify/card-class-collapse-drive.mjs`, which serves the build and
 * measures the real homepage AND /events; this guard holds the three things
 * that CAN be judged without a server, and a reader should not mistake its
 * green for the drive's.
 *
 * THE SECOND FAMILY, 19 September 2026. `EventCard` is the browse card and it
 * renders on eighteen surfaces. On /events its class values were 105,684 B,
 * 26.6% of a 397,482 B document, 88,323 B of it a value said again, and the
 * surface list alone was 428 characters said 40 times. It also carried six
 * INLINE STYLE objects per card, which no clause here can see: an inline style
 * is not a class attribute. That half is measured by the drive and by
 * scripts/perf/lib/document-weight.mjs, and is named here so the gap is a
 * known one rather than a surprise.
 *
 * ============================================================================
 * THREE CLAUSES
 * ============================================================================
 *
 *   A  CONTRACT. Every composite exists in globals.css and no per-card file
 *      has re-inlined one. This is what catches a revert, and it is the only
 *      clause that is exact rather than heuristic. It covers TWO card families
 *      now: the home rail card (8 composites) and the browse card
 *      (`EventCard` and the save control inside it, 15 composites,
 *      collapsed 19 September 2026).
 *
 *   B  RATCHET, platform-wide, with a REVIEWED BASELINE. No class literal in
 *      src/ over MAX_LITERAL characters unless it is listed below with a date
 *      and an owner. This is what would have caught the original defect on the
 *      day it was written. It carries a baseline rather than failing outright
 *      because eight such literals exist today across three lanes' files, and a
 *      guard that fails another lane's untouched code is a push refused at
 *      minute forty of a forty-eight minute gate. Baseline entries that no
 *      longer match anything are REPORTED, so the list cannot rot into an
 *      unexamined one.
 *
 *   C  FACT, --built. No class value may cost more than REPEAT_BUDGET bytes in
 *      repeats within one built document. Weak for the reason above, and kept
 *      because it is the only clause that reads what the build actually wrote.
 *
 * Clause B is a LENGTH rule and the real cost is length x multiplicity, which
 * is not knowable from source. A 561-character literal in the hero renders
 * once and is harmless; a 200-character literal in a card renders 300 times and
 * is not. Length is the proxy that is available at prebuild, and the drive is
 * what measures the product.
 *
 * AND CLAUSE B IS BLIND TO A CONCATENATION, WHICH IS NOT A THEORETICAL GAP.
 * It reads string LITERALS, so a class list assembled from several short ones
 * is invisible to it however long the result is. That is exactly how
 * `ARROW_BTN` in src/components/ui/snap-rail.tsx got to 642 characters, shipped
 * 22 times on the homepage for 14,766 B of repeats, while being six
 * concatenated literals none of which reached 400. Raising the limit would not
 * have helped; the shape was the problem.
 *
 * It has since been collapsed (it is `rail-arrow-btn` now, and snap-rail.tsx is
 * in CARD_FILES so clause A holds it), but the GAP is still real and the
 * next concatenation will be just as invisible. What catches that shape is the
 * `class lists` row scripts/perf/lib/document-weight.mjs now reports on every
 * served document, ranked by REMOVABLE bytes. The guard holds the source; the
 * reporter measures the output; neither is told it is doing the other's job.
 *
 * Usage:
 *   node scripts/guards/class-lists-are-not-repeated-per-card.mjs
 *   node scripts/guards/class-lists-are-not-repeated-per-card.mjs --built
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripJsComments } from './lib/strip-js-comments.mjs'

const TAG = '[class-lists-are-not-repeated-per-card]'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BUILT = process.argv.includes('--built')
const APP = join(ROOT, '.next', 'server', 'app')

/** Clause A: the composites, and the files that must use them. */
const COMPOSITES = [
  'home-card-surface',
  'home-card-zoom',
  'home-card-title',
  'home-card-label',
  'home-card-date',
  'home-card-price',
  'rail-arrow-btn',
  'rail-header-link',
  /* The browse card family (`EventCard`), collapsed 19 September 2026. A
   * second family rather than a reuse of the home card's: it is a different
   * component with different values (its own radius scale, `scale-[1.025]`,
   * a 4:3 media box from the md step) and folding the two together would have
   * changed one of them to save bytes in the other. */
  'event-card-surface',
  'event-card-media',
  'event-card-zoom',
  'event-card-badge',
  'event-card-pill',
  'event-card-body',
  'event-card-date',
  'event-card-title',
  'event-card-meta',
  'event-card-footer',
  'event-card-price',
  'save-event-btn',
  'save-event-btn-dark',
  'save-event-btn-light',
  'event-card-save',
  /* The shared chrome, collapsed 19 September 2026. Not a card family: these
   * render once per LINK, on every page, which is why the same figures came
   * back on all five routes sampled. */
  'chrome-footer-link',
  'chrome-footer-social',
  'chrome-footer-legal',
  'chrome-footer-accordion-link',
  'chrome-footer-title',
  'chrome-nav-link',
  'chrome-drawer-link',
  'chrome-bottom-item',
  'chrome-wordmark',
  'chrome-wordmark-link',
  /* Not a class list at all, and here because it has the same failure mode: a
   * one-line deletion that nothing else notices. `cv-section` is what stops
   * every homepage rail laying out before the first paint (close-out C8,
   * 6 September 2026). Removing it costs measured milliseconds on every
   * visit and breaks no test, no type and no screenshot. */
  'cv-section',
]

/**
 * Clause A2: the CALL SITES, added 19 September 2026 with the chrome collapse.
 *
 * WHY THIS IS NOT JUST MORE ENTRIES IN CARD_FILES. That list carries a
 * 120-character literal limit, which is right for a file whose every literal
 * is paid per card. The chrome files are not that shape: `site-header-client`
 * holds the search pill, the account menu and the drawer, most of it written
 * once per page and legitimately long. Holding them to the card limit would
 * have failed on literals that are not defects, and a guard that fails on
 * things that are fine is a guard somebody switches off.
 *
 * So the contract here is exact instead: this file must name this composite.
 * That is what catches the revert - a call site that goes back to writing the
 * list out - without judging anything else in the file.
 */
const COMPOSITE_CALL_SITES = [
  { file: 'src/components/layout/site-footer.tsx', composite: 'chrome-footer-title' },
  { file: 'src/components/layout/site-footer.tsx', composite: 'chrome-footer-link' },
  { file: 'src/components/layout/site-footer.tsx', composite: 'chrome-footer-social' },
  { file: 'src/components/layout/site-footer.tsx', composite: 'chrome-footer-legal' },
  { file: 'src/components/layout/footer-accordion.tsx', composite: 'chrome-footer-accordion-link' },
  { file: 'src/components/layout/site-header-client.tsx', composite: 'chrome-nav-link' },
  { file: 'src/components/layout/site-header-client.tsx', composite: 'chrome-drawer-link' },
  { file: 'src/components/layout/mobile-bottom-nav.tsx', composite: 'chrome-bottom-item' },
  { file: 'src/components/ui/eventlinqs-logo.tsx', composite: 'chrome-wordmark' },
  { file: 'src/components/ui/eventlinqs-logo.tsx', composite: 'chrome-wordmark-link' },
  /* SECTION_RAIL is how `cv-section` reaches every rail section on the
   * homepage. The class existing in globals.css is worth nothing if the one
   * constant that applies it stops doing so. */
  { file: 'src/lib/ui/spacing.ts', composite: 'cv-section' },
]
const GLOBALS = 'src/app/globals.css'
/**
 * The per-item component files: every one of these renders ONCE PER CARD (or
 * once per rail, on every page), so a class literal written here is paid per
 * item in the markup and again in the RSC payload.
 */
const CARD_FILES = [
  'src/components/features/home/cards.tsx',
  'src/components/features/home/sounds-rail.tsx',
  /* snap-rail.tsx is here because it holds the ONE canonical rail control
   * (CLAUDE.md, Rail Control System) and every rail on the platform renders it,
   * so a class list re-inlined here is multiplied by every rail on every page
   * rather than by the cards in one. */
  'src/components/ui/snap-rail.tsx',
  /* The browse card and the save control inside it. event-card.tsx renders on
   * EIGHTEEN surfaces, which is why its 428-character surface list was the
   * largest repeated value on /events before it was collapsed. */
  'src/components/features/events/event-card.tsx',
  'src/components/features/events/save-event-button.tsx',
]
/** A collapsed file has no class literal anywhere near the old 464. */
const CARD_MAX_LITERAL = 120

/**
 * REVIEWED EXEMPTIONS for clause A, 19 September 2026. Same shape and same
 * discipline as the clause B baseline: keyed by file and by a stable prefix,
 * dated, with the reason, and reported when it stops matching.
 *
 * The limit is deliberately tight (120) because these files hold components
 * that render once per CARD. What lives in them and does NOT is the empty
 * state, which renders once per empty rail. Raising the limit to accommodate
 * two once-per-rail literals would have made the clause blind to a 289-
 * character literal arriving in a card, which is the thing it is for.
 */
const CARD_BASELINE = [
  {
    file: 'src/components/features/home/cards.tsx',
    startsWith: 'flex w-full flex-col items-start justify-center gap-2 rounded-2xl border border-dashed',
    why: 'the rail empty state, not a card. Renders once per EMPTY rail, so its 138 characters are paid once and there is nothing to multiply.',
  },
  {
    file: 'src/components/features/home/cards.tsx',
    startsWith: 'mt-2 inline-flex min-h-[44px] items-center rounded-full',
    why: 'the empty state CTA. Once per empty rail, as above.',
  },
]

/** Clause B. */
const MAX_LITERAL = 400

/**
 * REVIEWED BASELINE, 19 September 2026. Every class literal in src/ over
 * MAX_LITERAL characters on the day this guard was written, with who owns the
 * file and what should happen to it. `file:line` is deliberately NOT the key -
 * a line number moves with any edit above it - so entries are keyed by file and
 * by a stable prefix of the literal itself.
 */
const BASELINE = [
  {
    file: 'src/components/features/home/FeaturedHeroClient.tsx',
    startsWith: 'sr-only focus-visible:not-sr-only',
    why: 'the hero skip/pause control. Renders ONCE per page, so its length costs 561 bytes, not 561 x n. Lane C, not worth collapsing.',
  },
  {
    file: 'src/components/features/home/FeaturedHeroClient.tsx',
    startsWith: 'plausible-event-name=hero_get_tickets_click',
    why: 'the hero CTA. Once per page. Lane C, not worth collapsing.',
  },
  {
    file: 'src/components/features/home/FeaturedHero.tsx',
    startsWith: 'inline-flex h-12 items-center justify-center rounded-full',
    why: 'the server-rendered hero CTA, the same control as above. Once per page. Lane C.',
  },
  {
    file: 'src/app/events/[slug]/page.tsx',
    startsWith: 'inline-flex min-h-11 items-center rounded-lg bg-gold-500',
    why: 'the event page Get Tickets CTA, written twice in one file. Once per page each. Lane A owns the checkout entry point.',
  },
  /* The 428-character event-card surface list stood here from the day this
   * guard was written until 19 September 2026, as "THE NEXT ITEM". It was the
   * next item: it is `event-card-surface` now and the entry is gone, which is
   * what a baseline entry is supposed to do. */
  {
    file: 'src/components/features/events/hero-carousel-client.tsx',
    startsWith: 'absolute right-4 top-1/2 z-20 hidden h-11 w-11',
    why: 'carousel next control. Once per carousel. Lane C.',
  },
  {
    file: 'src/components/features/events/hero-carousel-client.tsx',
    startsWith: 'absolute left-4 top-1/2 z-20 hidden h-11 w-11',
    why: 'carousel previous control. Once per carousel. Lane C.',
  },
]

/** Clause C. Highest repeat cost measured across the 66 built documents on the
 *  day this was written was 3,808 B (_not-found.html). */
const REPEAT_BUDGET = 6000

/**
 * Looks like a Tailwind class list, rather than any long string. Requires four
 * distinct utility-shaped tokens AND a space, so a URL, a sentence of copy or a
 * base64 blob is not mistaken for one.
 */
const UTILITY_TOKEN =
  /(?:^|\s)(?:(?:hover|focus|focus-visible|group-hover|motion-reduce|sm|md|lg|xl|dark):)*(?:flex|grid|block|inline-flex|hidden|w-|h-|min-h-|p[xytblr]?-|m[xytblr]?-|text-|bg-|border|rounded|shadow|transition|duration-|ease-|gap-|items-|justify-|font-|leading-|tracking-|overflow-|absolute|relative|object-|aspect-|line-clamp|sr-only|z-)/g

function looksLikeClassList(value) {
  if (!value.includes(' ')) return false
  const hits = value.match(UTILITY_TOKEN)
  return Boolean(hits && hits.length >= 4)
}

/** Every single- or double-quoted literal on a line, with its line number. */
const LITERAL = /'([^'\n]{40,})'|"([^"\n]{40,})"/g

function literalsIn(text) {
  const out = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    LITERAL.lastIndex = 0
    let m
    while ((m = LITERAL.exec(lines[i])) !== null) {
      const value = m[1] ?? m[2]
      if (looksLikeClassList(value)) out.push({ line: i + 1, value })
    }
  }
  return out
}

function walk(dir, test, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path, test, out)
      continue
    }
    if (test(name)) out.push(path)
  }
  return out
}

const faults = []
const notes = []
const rel = p => relative(ROOT, p).split(sep).join('/')

/* ── Clause A: the contract ────────────────────────────────────────────────── */
let clauseAChecks = 0
const homeBaselineHits = new Set()
const globalsPath = join(ROOT, GLOBALS)
if (!existsSync(globalsPath)) {
  faults.push(`${GLOBALS} does not exist, so the composites cannot be checked`)
} else {
  const css = readFileSync(globalsPath, 'utf8')
  for (const name of COMPOSITES) {
    clauseAChecks += 1
    /* ANCHORED TO THE OPENING BRACE, NOT TO A WORD BOUNDARY, and the first
     * version used `\b`. A hyphen is not a word character, so `home-card-surface\b`
     * matched inside `home-card-surface-renamed` and the guard passed on a tree
     * where the composite had been renamed out from under 104 cards. The drill
     * "a composite ... is deleted from globals.css" found it on its first run. */
    if (!new RegExp(`@utility\\s+${name}\\s*\\{`).test(css)) {
      faults.push(
        `A: @utility ${name} is not defined in ${GLOBALS}. It is rendered once per card or once per ` +
          `link on every page that uses it, so deleting it strips whatever it declared - a border, a ` +
          `padding, a hover colour, a focus ring - and nothing else goes red.`,
      )
    }
  }
}
for (const file of CARD_FILES) {
  const path = join(ROOT, file)
  if (!existsSync(path)) {
    faults.push(`A: ${file} does not exist; the home card contract cannot be judged`)
    continue
  }
  const text = readFileSync(path, 'utf8')
  clauseAChecks += 1
  /* Comment-blind for the same reason clause A2 is. */
  const usesOne = COMPOSITES.some(name => stripJsComments(text).includes(name))
  if (!usesOne) {
    faults.push(`A: ${file} references none of the composites (${COMPOSITES.join(', ')}); the collapse has been undone`)
  }
  for (const { line, value } of literalsIn(text)) {
    clauseAChecks += 1
    if (value.length > CARD_MAX_LITERAL) {
      const exempt = CARD_BASELINE.find(b => b.file === file && value.startsWith(b.startsWith))
      if (exempt) {
        homeBaselineHits.add(`${exempt.file}|${exempt.startsWith}`)
        continue
      }
      faults.push(
        `A: ${file}:${line} carries a ${value.length}-character class literal (limit ${CARD_MAX_LITERAL} in a per-card file). ` +
          `These components render once per card, so a literal here is paid per card in the markup AND again in the RSC ` +
          `payload. Put it in globals.css as an @utility with @apply. Literal begins: ${value.slice(0, 60)}`,
      )
    }
  }
}

/* ── Clause A2: the chrome call sites ─────────────────────────────────────── */
for (const { file, composite } of COMPOSITE_CALL_SITES) {
  const path = join(ROOT, file)
  clauseAChecks += 1
  if (!existsSync(path)) {
    faults.push(`A2: ${file} does not exist, so the ${composite} contract cannot be judged`)
    continue
  }
  /* COMMENTS ARE NOT CODE, and the drill proved it matters: `cv-section` was
   * deleted from SECTION_RAIL's value while the comment beside it still said
   * the word, and this clause passed on a tree where every homepage rail had
   * stopped skipping below-the-fold layout. */
  if (!stripJsComments(readFileSync(path, 'utf8')).includes(composite)) {
    faults.push(
      `A2: ${file} does not reference ${composite}. That composite exists for this call site, so ` +
        `either the class list has been written out again - once per link, on every page - or the ` +
        `composite is now dead and belongs deleted rather than orphaned.`,
    )
  }
}

/* ── Clause B: the platform-wide ratchet, with its reviewed baseline ───────── */
const baselineHits = new Set()
let overLimit = 0
const srcFiles = walk(join(ROOT, 'src'), n => n.endsWith('.tsx') || n.endsWith('.ts'))
for (const path of srcFiles) {
  const file = rel(path)
  const text = readFileSync(path, 'utf8')
  for (const { line, value } of literalsIn(text)) {
    if (value.length <= MAX_LITERAL) continue
    overLimit += 1
    const entry = BASELINE.find(b => b.file === file && value.startsWith(b.startsWith))
    if (entry) {
      baselineHits.add(`${entry.file}|${entry.startsWith}`)
      continue
    }
    faults.push(
      `B: ${file}:${line} carries a ${value.length}-character class literal (limit ${MAX_LITERAL}). ` +
        `If it renders once per page it is cheap and belongs in this guard's reviewed baseline with a date and a reason; ` +
        `if it renders per item it is paid twice per item and belongs in globals.css as an @utility. ` +
        `Literal begins: ${value.slice(0, 60)}`,
    )
  }
}
for (const b of BASELINE) {
  if (!baselineHits.has(`${b.file}|${b.startsWith}`)) {
    notes.push(
      `B: baseline entry no longer matches anything and should be deleted: ${b.file} "${b.startsWith.slice(0, 44)}"`,
    )
  }
}
for (const b of CARD_BASELINE) {
  if (!homeBaselineHits.has(`${b.file}|${b.startsWith}`)) {
    notes.push(
      `A: exemption no longer matches anything and should be deleted: ${b.file} "${b.startsWith.slice(0, 44)}"`,
    )
  }
}

/* ── Clause C: the built documents ────────────────────────────────────────── */
const BS = String.fromCharCode(92)
const CLASS_ATTR = /class="([^"]{20,})"/g
const CLASS_FLIGHT = new RegExp(`className${BS}${BS}":${BS}${BS}"([^${BS}${BS}]{20,})${BS}${BS}"`, 'g')

function repeatCosts(text) {
  const counts = new Map()
  for (const re of [CLASS_ATTR, CLASS_FLIGHT]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const out = []
  for (const [value, n] of counts) if (n > 1) out.push({ value, count: n, bytes: value.length * (n - 1) })
  return out.sort((a, b) => b.bytes - a.bytes)
}

/**
 * CALIBRATION. This clause can only fail by FINDING something, so a matcher
 * that has gone blind and a build that is clean produce the same green. Both
 * matchers are run over a document built here whose answer is known, and the
 * guard REFUSES rather than reporting a pass it did not earn.
 */
const probeClass = 'probe-one probe-two probe-three rounded-2xl shadow-lg'
/* The flight form is a JS string literal, so the framework escapes each quote
 * as ONE backslash followed by a quote. The first version of this probe wrote
 * TWO, the matcher found only the markup pair, and the calibration refused
 * rather than reporting a pass over a half-blind instrument - which is the
 * whole reason this clause exists. */
const flightPair = `className${BS}":${BS}"${probeClass}${BS}"`
const probeDoc =
  `<div class="${probeClass}"></div><div class="${probeClass}"></div>` +
  `<script>self.__next_f.push([1,"${flightPair}${flightPair}"])</script>`
const probe = repeatCosts(probeDoc).find(r => r.value === probeClass)
if (!probe) {
  console.error(`${TAG} REFUSING: the calibration probe was not found by its own matchers.`)
  console.error(`${TAG} Nothing below would be a finding about this platform, so no verdict is given.`)
  process.exit(1)
}
if (probe.count < 4) {
  console.error(`${TAG} REFUSING: the calibration probe was found ${probe.count} time(s), expected 4 (2 markup + 2 flight).`)
  console.error(`${TAG} One of the two matchers is blind, so a clean report would be meaningless.`)
  process.exit(1)
}

let documentsWeighed = 0
let worst = { bytes: 0 }
if (BUILT) {
  if (!existsSync(APP)) {
    console.error(`${TAG} REFUSING: --built was given but ${rel(APP)} does not exist. Run a build first.`)
    process.exit(1)
  }
  for (const path of walk(APP, n => n.endsWith('.html') || n.endsWith('.rsc'))) {
    documentsWeighed += 1
    const text = readFileSync(path, 'utf8')
    for (const row of repeatCosts(text)) {
      if (row.bytes > worst.bytes) worst = { ...row, document: rel(path) }
      if (row.bytes > REPEAT_BUDGET) {
        faults.push(
          `C: ${rel(path)} repeats one ${row.value.length}-character class value ${row.count} times, ` +
            `costing ${row.bytes} B beyond the first (budget ${REPEAT_BUDGET}). Collapse it into an @utility. ` +
            `Value begins: ${row.value.slice(0, 60)}`,
        )
      }
    }
  }
  if (documentsWeighed === 0) {
    console.error(`${TAG} REFUSING: --built weighed 0 documents. A step that performed no work is not a step that passed.`)
    process.exit(1)
  }
}

for (const n of notes) console.log(`${TAG} note: ${n}`)
if (faults.length) {
  console.error(`${TAG} FAIL - ${faults.length} fault(s)`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(
  `${TAG} calibration ok (probe found ${probe.count} times, ${probe.bytes} B of repeats). ` +
    `A: ${clauseAChecks} contract check(s) on ${COMPOSITES.length} composite(s). ` +
    `B: ${srcFiles.length} source file(s), ${overLimit} literal(s) over ${MAX_LITERAL} chars, ` +
    `${BASELINE.length} reviewed baseline entr(ies).` +
    (BUILT
      ? ` C: ${documentsWeighed} built document(s), worst repeat ${worst.bytes} B against a budget of ${REPEAT_BUDGET}` +
        (worst.document ? ` (${worst.document})` : '') +
        '.'
      : ' C: not run (no --built); the served homepage is covered by card-class-collapse-drive.mjs, not by this guard.'),
)
console.log(`${TAG} PASS`)
