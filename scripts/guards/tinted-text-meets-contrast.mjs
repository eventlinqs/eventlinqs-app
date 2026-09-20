/**
 * TINTED TEXT MEETS CONTRAST. A build-failing guard (close-out UX1, extended
 * by lane B on 21 September 2026 with clause 2, the tints).
 *
 * WHY THIS EXISTS, and why it is a computation rather than a list.
 *
 * On 5 September 2026 axe found coral text on a light surface at 3.28:1 and
 * 4.13:1, on the ticket selector and the access-code error. Both were fixed, and
 * a test was written to hold them: `tests/unit/a11y/light-surface-text-tokens`,
 * which asserts that no text is painted coral - across a HAND-LISTED TWO FILES.
 *
 * On 11 September 2026 the checkout viewport proof failed with
 * `color-contrast` on the buying path again. The offender was
 * `social-proof-badge.tsx`, the "Selling Fast" badge, coral-600 on coral-100 at
 * 3.42:1, shown on every event that is 50 percent sold or more - which is
 * exactly the events that matter commercially. The test could not see it,
 * because the file was not on its list, and no list ever contains the file
 * nobody added to it.
 *
 * Probing the whole tree for the same shape then found TWENTY-EIGHT pairs under
 * AA, in only two repeated combinations: `text-gold-600` on `bg-gold-100` at
 * 2.95:1, in fifteen places, and `text-ink-400` on `bg-ink-100` at 4.13:1, in
 * eleven. Several were text badges on the dashboard, the squad page and the
 * order table. Not one of them was on any list.
 *
 * WHY CLAUSE 2 EXISTS, AND IT IS THE SAME STORY A FOURTH TIME.
 *
 * Everything above was about SOLID tokens. This guard declined, in writing, to
 * judge any class string carrying an opacity modifier, on the reasoning that
 * "the painted colour depends on what is behind it, which a source file does
 * not know". That sentence was true of `text-white/60` over a photograph and
 * it was never true of `bg-success/15`, because a tint is a KNOWN token at a
 * KNOWN alpha and this platform is light by law: the Design system forbids flat
 * painted dark surfaces, so a tint lands on white, canvas or ink-100 and on
 * nothing else.
 *
 * The proof that the arithmetic was always available is that it was being done
 * BY HAND. globals.css carries four hand-computed composites in its own
 * comments - 2.94:1, 2.83:1, 5.20:1, 5.00:1 - each written after axe found a
 * failure on a live surface. This file now computes those same four numbers and
 * agrees with all four to the second decimal.
 *
 * What the gap cost, measured on 21 September 2026 before any of it was fixed:
 * TWENTY-NINE semantic-text-on-its-own-tint pairs in the tree, and NOT ONE of
 * them reached 4.5:1. The worst was 1.91:1, amber on amber, carrying the "18+
 * only" age restriction on the public event page. Four separate surfaces had
 * already been corrected one at a time by hand - /tickets (57 failing badges on
 * one screen), /t/[code], /artists and /artists/[slug] - and each correction was
 * accompanied by a comment saying so, and none of them could stop the next one.
 *
 * WHAT IT CHECKS.
 *   CLAUSE 1  A solid token text colour on a solid token background, in one
 *             class string. Under 4.5:1 fails.
 *   CLAUSE 2  A solid token text colour on a TINTED token background
 *             (`bg-<token>/<alpha>`), composited over each of the platform's
 *             three light surfaces, and judged on the LEAST favourable of the
 *             three. A class string does not say which surface it lands on, so
 *             the pair has to be safe on all of them, which is the bar
 *             globals.css sets in its own words beside --color-success-strong:
 *             "6.20:1 on white, 5.93:1 on canvas and 5.30:1 on ink-100, so one
 *             token is safe on all three".
 *
 *             IT WAS WRITTEN THE OTHER WAY FIRST, on the most favourable
 *             surface, on the argument that a failure nobody can argue with is
 *             worth more than a strict one. `tests/unit/a11y/
 *             semantic-text-on-its-own-tint` refused it within the hour:
 *             text-error-strong on bg-error/15 is 5.10:1 on white and 4.42:1
 *             on ink-100, so the lenient rule would have passed seven message
 *             banners this very item had just introduced. Turning it round
 *             found those seven and NOTHING ELSE in 84 tinted pairs, so the
 *             strict rule costs the tree nothing it was not already meeting.
 * All contrast is WCAG 2.1 relative luminance computed from the hex values in
 * `globals.css`, never judged by eye or carried as a copy.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, because a guard that guesses is a guard
 * that gets switched off:
 *   - A TEXT colour with an opacity modifier (`text-white/60`). The alpha is on
 *     the ink, so the painted colour depends on the photograph behind it.
 *   - INK THAT IS ITSELF A LIGHT SURFACE TOKEN (`text-white` on `bg-success`).
 *     The element is on dark or on a fill, which this cannot resolve. See the
 *     note at the check itself: this is the coverage the guard already had.
 *   - GRADIENTS, for the same reason.
 *   - A TEXT colour with NO background in the same class string. It inherits
 *     from an ancestor this cannot see. A THIRD CLAUSE FOR THIS WAS WRITTEN ON
 *     21 SEPTEMBER AND DELETED THE SAME HOUR, and the reason is worth keeping:
 *     it condemned a token whenever the token failed on all three light
 *     surfaces, which sounds surface-independent and is not. `text-white` fails
 *     all three at 1.17:1 and is correct on every hero on the platform; the
 *     clause raised 30 faults and every one of them was a photograph. Deciding
 *     whether the ancestor is light or dark is exactly the guess this guard
 *     refuses, and axe is what measures it.
 *   - A background token this file cannot resolve, including `text-ink-700`,
 *     which globals.css records as generating no colour at all.
 *   - A pair split across two class strings, which is what
 *     `src/app/tickets/page.tsx` does: the tone constant and the size are in
 *     different literals. That page is correct today and was corrected by hand.
 *   - Whether the text is large (WCAG allows 3:1 at 24px, or 18.66px bold).
 *     Every pair is held to the stricter number rather than guessing.
 * Those gaps are named rather than hidden, and they are the half axe covers.
 *
 * Run: node scripts/guards/tinted-text-meets-contrast.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[tinted-text-meets-contrast]'

/** WCAG 2.1 1.4.3, normal text. Large text has a lower floor; this does not
 *  attempt to read font size out of a class string, so it holds every pair to
 *  the stricter number rather than guessing which are large. */
const AA_NORMAL = 4.5

/**
 * THE ONLY NUMBER IN THIS FILE THAT IS NOT DERIVED FROM A TOKEN, and it is a
 * MEASUREMENT rather than a judgement.
 *
 * This file composites in sRGB. The browser does not. Tailwind v4 writes a tint
 * as `color-mix(in oklab, var(--color-success) 15%, transparent)`, and the
 * OKLab round trip moves a channel by up to one unit in 255, which changes a
 * ratio in the third decimal and nowhere else.
 *
 * It was found rather than anticipated. `scripts/verify/lb-tintaa-drive.mjs`
 * mounts every pair in a real page and asks Chromium what it painted:
 *
 *   text-success-strong on bg-success/15 over ink-100
 *     this file, in sRGB      #CDE1D2   4.51:1   PASS
 *     Chromium, through oklab #CDE0D2   4.48:1   FAIL
 *
 * Over white the two agree to the digit (#DBF0E6, 5.20:1 both ways), so the
 * disagreement only appears where a pair is already within a whisker of the
 * floor, which is exactly where it must not be trusted. Rather than
 * reverse-engineer a compositor, this file holds a margin of the measured
 * disagreement rounded up, and the drive remains the authority at the margin.
 * A pair that needs the last 0.05 of the floor is a pair to fix, not to argue.
 */
const COMPOSITOR_MARGIN = 0.05
const FLOOR = AA_NORMAL + COMPOSITOR_MARGIN

/**
 * THE BORDER BASELINE. Dated, owned, and it CANNOT ROT: an entry that matches
 * nothing in the tree fails this guard, because a permission for a thing that
 * no longer exists is an unexamined list forming.
 *
 * Every entry is a real WCAG AA failure, measured, that lane B is not permitted
 * to fix. The three-lane protocol of 13 September 2026 gives lane A the
 * checkout payment intent, Stripe webhooks, refunds, the slot ledger and
 * connected accounts, and lane A's MONEY FIX is live in exactly those files.
 * A one-token className change is not worth a merge conflict that costs three
 * lanes a 48 minute push, so each is recorded here and raised as a BORDER line
 * in C:\dev\REVIEW-QUEUE-B.md with the measurement and the replacement already
 * worked out.
 *
 * Delete the entry when the pair is fixed. The guard will tell you if you
 * forget.
 */
const BORDER_BASELINE = [
  {
    file: 'src/app/(dashboard)/dashboard/events/[id]/refunds/request-list.tsx',
    fg: 'warning',
    bg: 'warning/15',
    lane: 'A (refunds)',
    since: '2026-09-21',
    note: '1.91:1. The refund-request status badge. Use text-ink-900 (16.14:1); there is no --color-warning-strong and this item did not invent one.',
  },
  {
    file: 'src/components/payouts/refunds-list.tsx',
    fg: 'error',
    bg: 'error/10',
    lane: 'A (refunds)',
    since: '2026-09-21',
    note: '4.13:1. Use text-error-strong (5.54:1), which payouts-history-table.tsx in the same directory already uses on the same tint.',
  },
  {
    file: 'src/components/payouts/summary-cards.tsx',
    fg: 'warning',
    bg: 'warning/10',
    lane: 'A (the money chain)',
    since: '2026-09-21',
    note: '1.99:1. Use text-ink-900 (15.52:1).',
  },
  {
    file: 'src/components/payouts/summary-cards.tsx',
    fg: 'success',
    bg: 'success/10',
    lane: 'A (the money chain)',
    since: '2026-09-21',
    note: '3.12:1. Use text-success-strong (5.52:1).',
  },
  {
    file: 'src/components/organiser/connect-onboarding-card.tsx',
    fg: 'error',
    bg: 'error/5',
    lane: 'A (connected accounts)',
    since: '2026-09-21',
    note: '4.47:1. Use text-error-strong (5.98:1). The closest of them all to the floor, and still under it.',
  },
]

/** The token table, READ FROM globals.css so it can never carry a stale copy. */
const CSS = join(ROOT, 'src/app/globals.css')
const TOKENS = new Map()
for (const m of readFileSync(CSS, 'utf8').matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) {
  TOKENS.set(m[1], m[2].toUpperCase())
}
if (TOKENS.size === 0) {
  console.error(`${TAG} FAIL - no colour tokens could be read from ${relative(ROOT, CSS)}.`)
  console.error('  A guard that read no tokens cannot report a pass.')
  process.exit(1)
}

/**
 * The surfaces a tint is allowed to land on. CLAUDE.md, Design system:
 * "No flat painted dark backgrounds. Every surface is the light navy-on-canvas
 * homepage system." Darkness comes from a PHOTOGRAPH, which no tinted badge
 * sits on. These three are read from the token table rather than written here,
 * so a change to canvas or ink-100 moves the arithmetic with it.
 */
const LIGHT_SURFACES = ['white', 'canvas', 'ink-100']
const SURFACES = LIGHT_SURFACES.map((name) => {
  const hex = TOKENS.get(name)
  if (!hex) {
    console.error(`${TAG} FAIL - the light surface token --color-${name} is not in ${relative(ROOT, CSS)}.`)
    console.error('  Every composite below is measured against it, so it cannot be assumed.')
    process.exit(1)
  }
  return { name, hex }
})

const channel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = (hex) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16))
function contrast(a, b) {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
/** Source-over compositing of an opaque token at `alpha` on an opaque surface. */
function composite(hex, alpha, surfaceHex) {
  const part = (i) => {
    const f = parseInt(hex.slice(i, i + 2), 16)
    const b = parseInt(surfaceHex.slice(i, i + 2), 16)
    return Math.round(f * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  }
  return `#${part(1)}${part(3)}${part(5)}`
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}

/** Any quoted literal that paints a background or a text colour. */
const CLASS_STRING = /['"`]([^'"`\n]*\b(?:bg|text)-[a-z]+(?:-[a-z0-9]+)*(?:\/\d{1,3})?\b[^'"`\n]*)['"`]/g
/**
 * EVERY `text-` and `bg-` utility in the string, not the first one.
 *
 * THE FIRST VERSION OF THIS TOOK THE FIRST MATCH AND IT SHIPPED BLIND FOR ONE
 * RUN. `text-` is a size prefix as well as a colour prefix, so on
 * `border border-error/30 bg-error/5 px-4 py-3 text-xs text-error` a
 * single-match regex resolves `xs`, finds no such token and returns, reporting
 * nothing about a pair at 4.47:1. Two of the six baseline entries matched
 * nothing on the first run and that is the only reason it was found: the rot
 * check fired on a guard that could not see its own baseline.
 *
 * A responsive or state variant (`sm:text-ink-900`, `hover:bg-gold-100`) is
 * deliberately NOT collected. It paints only at some widths or in some states
 * and this file cannot tell which pair is on screen together.
 */
function utilities(cls, prefix) {
  const found = []
  const rx = new RegExp(`(?:^|\\s)${prefix}-([a-z]+(?:-[a-z0-9]+)*)(?:/(\\d{1,3}))?(?=\\s|$)`, 'g')
  for (const m of cls.matchAll(rx)) {
    if (!TOKENS.has(m[1])) continue
    found.push({ token: m[1], alpha: m[2] === undefined ? null : Number(m[2]) / 100 })
  }
  return found
}

const files = walk(join(ROOT, 'src'))
const violations = []
const unreadable = []
/** file -> Set of `fg|bg` seen, so a baseline entry can be checked for rot. */
const seenPairs = new Map()
let solidPairs = 0
let tintedPairs = 0
let skippedComposite = 0

function noteSeen(rel, fg, bg) {
  if (!seenPairs.has(rel)) seenPairs.set(rel, new Set())
  seenPairs.get(rel).add(`${fg}|${bg ?? ''}`)
}
function isBordered(rel, fg, bg) {
  return BORDER_BASELINE.some((e) => e.file === rel && e.fg === fg && (e.bg ?? null) === (bg ?? null))
}

for (const full of files) {
  const rel = relative(ROOT, full).split('\\').join('/')
  let src
  try {
    src = readFileSync(full, 'utf8')
  } catch (cause) {
    unreadable.push(`${rel} (${cause.message})`)
    continue
  }
  CLASS_STRING.lastIndex = 0
  for (const m of src.matchAll(CLASS_STRING)) {
    const cls = m[1]
    const line = src.slice(0, m.index).split('\n').length
    if (/gradient/.test(cls)) {
      skippedComposite += 1
      continue
    }
    const backgrounds = utilities(cls, 'bg')
    const inks = utilities(cls, 'text')
    // The alpha on the INK is the case this cannot resolve: what is behind it
    // is a photograph as often as a surface.
    const opaqueInks = inks.filter((i) => i.alpha === null)
    skippedComposite += inks.length - opaqueInks.length
    // More than one of either and which lands on which is a judgement about
    // markup this file is not reading. Named rather than guessed.
    if (opaqueInks.length !== 1 || backgrounds.length > 1) {
      if (opaqueInks.length > 1 || backgrounds.length > 1) skippedComposite += 1
      continue
    }
    const fg = opaqueInks[0].token
    const fgHex = TOKENS.get(fg)

    // BOTH CLAUSES JUDGE LIGHT-SYSTEM INK ONLY. When the ink is itself one of
    // the three light surface tokens the element is on dark, or on a solid
    // fill, and neither is a backdrop this file can resolve.
    //
    // Two shapes in the tree say so. `Button.tsx` paints `text-white` on
    // `bg-white/10`, a wash for the navy hero, which measures 1.15:1 if you
    // insist on compositing it over ink-100 and is perfectly legible where it
    // lives. And three onboarding checklists paint `text-white` on a solid
    // `bg-success` at 3.51:1, which is an `aria-hidden` tick ICON in a 20px
    // circle, not text: WCAG 1.4.11 asks 3:1 of it and it has that.
    //
    // This is also exactly the coverage the guard had before 21 September: its
    // matcher was `text-[a-z]+-\d{3}`, which never matched `text-white` at all,
    // so nothing is lost here that was ever held. It is stated rather than
    // inherited because the widening needed for tints would otherwise have
    // quietly changed what clause 1 judges.
    if (LIGHT_SURFACES.includes(fg)) {
      skippedComposite += 1
      continue
    }

    if (backgrounds.length === 0) continue

    const { token: bgToken, alpha } = backgrounds[0]
    const bgHex = TOKENS.get(bgToken)
    if (alpha !== null && !(alpha > 0 && alpha <= 1)) {
      skippedComposite += 1
      continue
    }

    if (alpha === null) {
      // CLAUSE 1. Solid on solid: one surface, one answer.
      solidPairs += 1
      const ratio = contrast(fgHex, bgHex)
      noteSeen(rel, fg, bgToken)
      if (ratio < FLOOR) {
        if (isBordered(rel, fg, bgToken)) continue
        violations.push({ clause: 1, file: rel, line, fg, fgHex, bg: bgToken, bgHex, ratio })
      }
      continue
    }

    // CLAUSE 2. A tint: composite it over each light surface, judged on the
    // WORST of them, because the string does not say which one it lands on.
    tintedPairs += 1
    const bgLabel = `${bgToken}/${Math.round(alpha * 100)}`
    const measured = SURFACES.map((s) => {
      const wash = composite(bgHex, alpha, s.hex)
      return { surface: s.name, wash, ratio: contrast(fgHex, wash) }
    })
    const worst = measured.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    noteSeen(rel, fg, bgLabel)
    if (worst.ratio < FLOOR) {
      if (isBordered(rel, fg, bgLabel)) continue
      violations.push({ clause: 2, file: rel, line, fg, fgHex, bg: bgLabel, measured, worst })
    }
  }
}

if (unreadable.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${unreadable.length} path(s) could not be read:`)
  for (const u of unreadable) console.error(`    ${u}`)
  console.error('  A guard that scanned less than the whole tree cannot report a pass.')
  process.exit(1)
}

// The baseline is printed on EVERY run, so it is read rather than inherited,
// and an entry that matches nothing is a failure rather than a note: this list
// is six permissions to ship a WCAG failure and it may never outlive them.
const stale = BORDER_BASELINE.filter(
  (e) => !seenPairs.get(e.file)?.has(`${e.fg}|${e.bg ?? ''}`),
)
console.log('')
console.log(`${TAG} BORDER BASELINE - ${BORDER_BASELINE.length} measured AA failure(s) another lane owns:`)
for (const e of BORDER_BASELINE) {
  console.log(`    ${e.file}`)
  console.log(`      text-${e.fg}${e.bg ? ` on bg-${e.bg}` : ' (no background in the string)'}  lane ${e.lane}, since ${e.since}`)
  console.log(`      ${e.note}`)
}
if (stale.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${stale.length} baseline entry(ies) match nothing in the tree:`)
  for (const e of stale) {
    console.error(`    ${e.file}  text-${e.fg}${e.bg ? ` on bg-${e.bg}` : ''}`)
  }
  console.error('  Either the pair was fixed, in which case delete the entry, or the file moved.')
  console.error('  A permission for something that no longer exists is how an allowlist rots.')
  process.exit(1)
}

if (violations.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${violations.length} pair(s) under ${AA_NORMAL}:1 plus a measured compositor margin of ${COMPOSITOR_MARGIN} (WCAG 2.1 AA, normal text):`)
  for (const v of violations) {
    if (v.clause === 1) {
      console.error(
        `    [1] ${v.file}:${v.line}  text-${v.fg} (${v.fgHex}) on bg-${v.bg} (${v.bgHex}) = ${v.ratio.toFixed(2)}:1`,
      )
    } else if (v.clause === 2) {
      console.error(`    [2] ${v.file}:${v.line}  text-${v.fg} (${v.fgHex}) on bg-${v.bg}:`)
      for (const s of v.measured) {
        console.error(`          over ${s.surface.padEnd(8)} ${s.wash} = ${s.ratio.toFixed(2)}:1`)
      }
      console.error(`          worst of the three is ${v.worst.ratio.toFixed(2)}:1 (over ${v.worst.surface}), and a class string does not say which it sits on.`)
    }
  }
  console.error('')
  console.error('  The "Selling Fast" badge shipped coral-600 on coral-100 at 3.42:1, on every')
  console.error('  event 50 percent sold or more, and a test that banned coral text across two')
  console.error('  named files could not see it (close-out UX1). Four years of the same shape')
  console.error('  on TINTS was then corrected one surface at a time, by hand, because this')
  console.error('  guard skipped every class string carrying an opacity modifier.')
  console.error('')
  console.error('  Take the darker member of the same family, never a new hue:')
  console.error('    gold-800 on gold-100 is 6.47:1, coral-700 on coral-100 is 4.96:1,')
  console.error('    success-strong on success/15 is 5.20:1, error-strong on error/10 is 5.54:1.')
  console.error('  Where the tint is the signal and no -strong member exists, the platform')
  console.error('  already uses dark ink on the tint: ink-900 on warning/15 is 16.14:1.')
  process.exit(1)
}

declareWork('tinted-text-meets-contrast', {
  did: {
    'file scanned': files.length,
    'colour token read from globals.css': TOKENS.size,
    'light surface composited against': SURFACES.length,
    'solid text-on-solid pair measured': solidPairs,
    'solid text-on-tint pair composited': tintedPairs,
    'string left to axe (ink alpha or gradient)': skippedComposite,
    'border baseline entry another lane owns': BORDER_BASELINE.length,
  },
  found: { 'pair under the AA floor': violations.length },
  zeroIsFine: {
    'pair under the AA floor':
      'every measurable pair meeting 4.5:1 is the goal state; twenty-eight solid pairs did not on 11 September 2026 (UX1) and twenty-nine tinted pairs did not on 21 September 2026',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - ${solidPairs} solid pair(s), ${tintedPairs} tinted pair(s) over ${SURFACES.length} light surfaces, ` +
    `every one at or above ${FLOOR}:1 outside the ${BORDER_BASELINE.length} bordered.`,
)
process.exit(0)
