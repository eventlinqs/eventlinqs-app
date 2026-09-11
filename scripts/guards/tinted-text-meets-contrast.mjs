/**
 * TINTED TEXT MEETS CONTRAST. A build-failing guard (close-out UX1).
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
 * WHAT IT CHECKS. Every class string in `src` that paints a SOLID token text
 * colour on a SOLID token background, with the WCAG 2.1 contrast computed from
 * the hex values in `globals.css` rather than judged by eye or by memory. Under
 * 4.5:1 fails the build.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, because a guard that guesses is a guard
 * that gets switched off:
 *   - OPACITY MODIFIERS (`text-white/60`, `bg-black/30`). The painted colour
 *     depends on what is behind it, which a source file does not know. axe
 *     measures those against the real composite, and it runs on the surfaces.
 *   - GRADIENTS, for the same reason.
 *   - A text colour with no background in the same class string. It inherits
 *     from an ancestor this cannot see.
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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}

const CLASS_STRING = /['"`]([^'"`\n]*\b(?:bg|text)-[a-z]+-\d{3}\b[^'"`\n]*)['"`]/g
const files = walk(join(ROOT, 'src'))
const violations = []
const unreadable = []
let pairsChecked = 0
let skippedComposite = 0

for (const full of files) {
  const rel = relative(ROOT, full).replace(/\\/g, '/')
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
    if (/\/\d{1,3}\b/.test(cls) || /gradient/.test(cls)) {
      skippedComposite += 1
      continue
    }
    const bg = cls.match(/(?:^|\s)bg-([a-z]+-\d{3})(?:\s|$)/)
    const fg = cls.match(/(?:^|\s)text-([a-z]+-\d{3})(?:\s|$)/)
    if (!bg || !fg) continue
    const bgHex = TOKENS.get(bg[1])
    const fgHex = TOKENS.get(fg[1])
    if (!bgHex || !fgHex) continue
    pairsChecked += 1
    const ratio = contrast(fgHex, bgHex)
    if (ratio < AA_NORMAL) {
      violations.push({
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        fg: fg[1],
        bg: bg[1],
        fgHex,
        bgHex,
        ratio,
      })
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

if (violations.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${violations.length} text-on-tint pair(s) under ${AA_NORMAL}:1 (WCAG 2.1 AA, normal text):`)
  for (const v of violations) {
    console.error(
      `    ${v.file}:${v.line}  text-${v.fg} (${v.fgHex}) on bg-${v.bg} (${v.bgHex}) = ${v.ratio.toFixed(2)}:1`,
    )
  }
  console.error('')
  console.error('  The "Selling Fast" badge shipped coral-600 on coral-100 at 3.42:1, on every')
  console.error('  event 50 percent sold or more, and a test that banned coral text across two')
  console.error('  named files could not see it (close-out UX1).')
  console.error('')
  console.error('  Use the darker member of the same family: gold-800 on gold-100 is 6.47:1,')
  console.error('  ink-600 on ink-100 is 7.57:1, coral-700 on coral-100 is 4.96:1.')
  process.exit(1)
}

declareWork('tinted-text-meets-contrast', {
  did: {
    'file scanned': files.length,
    'colour token read from globals.css': TOKENS.size,
    'solid text-on-tint pair measured': pairsChecked,
    'composite pair left to axe': skippedComposite,
  },
  found: { 'pair under the AA floor': violations.length },
  zeroIsFine: {
    'pair under the AA floor':
      'every solid text-on-tint pair meeting 4.5:1 is the goal state; twenty-eight did not on 11 September 2026 (UX1)',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - ${pairsChecked} solid text-on-tint pair(s), every one at or above ${AA_NORMAL}:1.`,
)
process.exit(0)
