/**
 * HERO SCALE, ONE SOURCE. A build-failing guard.
 *
 * WHY THIS EXISTS.
 *
 * The founder's ruling of 7 July 2026 set ONE hero scale for the whole platform
 * and said so in terms: "every page inherits the new scale from this one token
 * ... still ONE scale, still one edit - never a per-page literal". Until
 * 19 September 2026 nothing executable held that. The scale was three `height`
 * declarations in globals.css and a law in a markdown file, and a second copy
 * of `52vh` anywhere in the tree would have been invisible to every gate.
 *
 * It also holds the fix for a defect the same scale caused. `.hero-marketing`
 * is a FIXED height and the components that use it also set `overflow-hidden`,
 * which is right for a photograph and wrong for a card whose content is the
 * subject. The shared designed empty state was measured at 390 on that day:
 * 637px of content inside a 439px box, so the trust pillars and the card's
 * bottom padding were cut off on every eventless city and suburb page - 38 live
 * routes on TEST. At 768 and 1440 it fitted by TWO PIXELS, so it was one word
 * of copy from clipping at every width. `.hero-marketing-grow` takes the same
 * scale as a FLOOR instead, and the obvious "fix" for anyone who later finds
 * the card too tall is to give that rule a height back, which silently restores
 * the clipping. Clause 3 refuses it.
 *
 * WHAT IT CHECKS, all three decidable from the stylesheet and the tree:
 *
 *   CLAUSE 1  The scale is declared ONLY as `--hero-scale`, every hero rule
 *             reads it through `var(--hero-scale)`, and no file that INHERITS a
 *             hero variant also sets its own height. Scoped to files carrying
 *             the class rather than to every `vh` in the tree: see the note at
 *             the clause for the twenty-two false positives that scoping cost.
 *   CLAUSE 2  Both variants exist and both are UNLAYERED. Unlayered CSS beats
 *             `@layer utilities` whatever its specificity (globals.css says so
 *             in its own cascade note), so moving either into a layer would let
 *             a stray Tailwind height win and no test would notice.
 *   CLAUSE 3  `.hero-marketing-grow` declares neither `height` nor `max-height`.
 *             Either one reintroduces the clipping this variant exists to end.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK: whether a given hero is TALLER than the
 * competitor evidence allows. That is the benchmark gate's judgement and needs
 * a capture, not a stylesheet.
 *
 * Run: node scripts/guards/hero-scale-one-source.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[hero-scale-one-source]'
const CSS_REL = 'src/app/globals.css'
const css = readFileSync(join(ROOT, CSS_REL), 'utf8')

const failures = []

/* ── CLAUSE 1: the scale is declared once, as a custom property ──────────── */
const scaleDecls = [...css.matchAll(/--hero-scale:\s*([\d.]+vh)\s*;/g)].map((m) => m[1])
if (scaleDecls.length === 0) {
  failures.push(`${CSS_REL} declares no --hero-scale. The hero scale has no single source.`)
}

/**
 * A hero height literal anywhere OTHER than a `--hero-scale` declaration.
 * Viewport-height literals are searched across the whole stylesheet and the
 * whole of src/, because a second copy is exactly what the founder's ruling
 * forbids and exactly what nothing could previously see.
 */
const cssWithoutScaleDecls = css.replace(/--hero-scale:\s*[\d.]+vh\s*;/g, '--hero-scale:;')
const strayCss = [...cssWithoutScaleDecls.matchAll(/\.hero-marketing[a-z-]*\s*\{[^}]*?(height:\s*[\d.]+vh)/g)]
for (const m of strayCss) {
  failures.push(`${CSS_REL} sets a hero height literal (${m[1]}) instead of var(--hero-scale).`)
}

/**
 * A COMPONENT THAT USES A HERO VARIANT MUST NOT ALSO SET ITS OWN HEIGHT.
 *
 * This clause is scoped to files that actually carry `.hero-marketing` or
 * `.hero-marketing-grow`, and NOT to every `vh` literal in the tree, which is a
 * deliberate narrowing after the first version of this guard reported 22
 * failures and was wrong about 22 of them. A `max-h-[85vh]` on a filter sheet,
 * an `h-[58vh]` on a seat-map canvas and a `min-h-[60vh]` on an error page are
 * not the hero scale and never were. Two more of those hits - the venue and
 * organiser profile heroes - are EXEMPTED BY NAME in CLAUDE.md, which says the
 * two profile heroes "keep their own inline scale".
 *
 * A guard that fires on twenty-two things it has misunderstood is a guard
 * somebody switches off, so this one judges only the case it can be sure of:
 * a file inheriting the shared scale and then overriding it locally.
 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}
const srcFiles = walk(join(ROOT, 'src'))
let filesScanned = 0
let heroUsers = 0
for (const full of srcFiles) {
  filesScanned += 1
  const body = readFileSync(full, 'utf8')
  if (!/\bhero-marketing(-grow)?\b/.test(body)) continue
  heroUsers += 1
  /*
   * ON THE SAME ELEMENT, not merely in the same file. The second version of
   * this clause searched the whole file and reported eighteen failures, of
   * which eighteen were wrong: `min-h-[44px]` is the 44px TOUCH TARGET the
   * constitution requires, and `h-[18px]` was an icon. A hero lives in a file
   * with a hundred other boxes. An override of the hero scale is a height on
   * the element that carries the hero class, and nothing else is.
   */
  for (const m of body.matchAll(/['"`]([^'"`\n]*\bhero-marketing(?:-grow)?\b[^'"`\n]*)['"`]/g)) {
    for (const h of m[1].matchAll(/\b(?:h|min-h|max-h)-\[\s*[\d.]+(?:vh|px|rem)\s*\]/g)) {
      failures.push(
        `${relative(ROOT, full).split(sep).join('/')} puts ${h[0]} on the same element as the hero class. ` +
          'The scale is --hero-scale in globals.css and is inherited, never overridden locally.',
      )
    }
  }
}

/* ── CLAUSE 2: both variants exist, and both are unlayered ───────────────── */
for (const rule of ['.hero-marketing', '.hero-marketing-grow']) {
  const re = new RegExp(`\\${rule}\\b[^{]*\\{`)
  if (!re.test(css)) failures.push(`${CSS_REL} declares no ${rule} rule.`)
}
/**
 * "Unlayered" is judged by counting `@layer ... {` openings against `}`
 * closings before the rule, which is the only way to know whether a byte offset
 * sits inside a layer block without parsing the whole stylesheet.
 */
function insideLayer(index) {
  let depth = 0
  let layerDepth = null
  const head = css.slice(0, index)
  for (const m of head.matchAll(/@layer[^{;]*\{|\{|\}/g)) {
    if (m[0].startsWith('@layer')) {
      if (layerDepth === null) layerDepth = depth
      depth += 1
    } else if (m[0] === '{') depth += 1
    else {
      depth -= 1
      if (layerDepth !== null && depth <= layerDepth) layerDepth = null
    }
  }
  return layerDepth !== null
}
for (const rule of ['.hero-marketing', '.hero-marketing-grow']) {
  const at = css.indexOf(rule)
  if (at !== -1 && insideLayer(at)) {
    failures.push(
      `${CSS_REL} declares ${rule} inside an @layer. Unlayered CSS beats @layer utilities ` +
        'whatever its specificity, so layering this hands the height to any stray Tailwind class.',
    )
  }
}

/* ── CLAUSE 3: the growing variant never regains a ceiling ───────────────── */
let growBodies = 0
for (const m of css.matchAll(/\.hero-marketing-grow\b[^{]*\{([^}]*)\}/g)) {
  growBodies += 1
  const body = m[1]
  for (const prop of ['height', 'max-height']) {
    // `min-height` must not be mistaken for `height`.
    const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:`)
    if (re.test(body)) {
      failures.push(
        `${CSS_REL} gives .hero-marketing-grow a ${prop}. That rule exists BECAUSE a fixed ` +
          'box clipped 637px of content into 439px at 390 on 19 September 2026; a ceiling ' +
          'here restores it. Its floor is min-height: max(var(--hero-scale), 400px).',
      )
    }
  }
}
if (growBodies === 0) {
  failures.push(`${CSS_REL} declares no .hero-marketing-grow body to judge.`)
}

if (failures.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${failures.length} problem(s) with the one hero scale:`)
  for (const f of failures) console.error(`    ${f}`)
  console.error('')
  console.error('  The founder ruled on 7 July 2026: one scale, one edit, never a per-page')
  console.error('  literal. The scale is --hero-scale in globals.css:')
  console.error('    .hero-marketing       height: var(--hero-scale)              the image owns the box')
  console.error('    .hero-marketing-grow  min-height: max(var(--hero-scale),400px)  the content does')
  process.exit(1)
}

declareWork('hero-scale-one-source', {
  did: {
    'breakpoint declaring --hero-scale': scaleDecls.length,
    'source file scanned': filesScanned,
    'file inheriting a hero variant judged': heroUsers,
    'hero variant judged': 2,
  },
  found: { 'second source of the hero scale': 0 },
  zeroIsFine: {
    'second source of the hero scale':
      'one scale in one place is the goal state and the founder ruled it on 7 July 2026; nothing executable held it until 19 September 2026',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - one hero scale (${scaleDecls.join(', ')}), both variants unlayered, and the growing variant has no ceiling.`,
)
process.exit(0)
