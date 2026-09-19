/**
 * SURFACE FLAG COLOURS BRANCH. A build-failing guard.
 *
 * WHY THIS EXISTS.
 *
 * `CategoryHeroEmpty` is the shared designed empty state. It renders on every
 * city, suburb, community-by-city, category, weekend, feed, artist, organiser
 * and venue page that has no events - the surface an organiser's very first
 * visitor is most likely to land on. It takes a `coverImage` and paints itself
 * one of two ways: a photograph with a navy scrim, or a light canvas card.
 *
 * Seven colour decisions in it branched on that flag. Two did not, and on
 * 19 September 2026 both were wrong:
 *
 *   the trust-pillar ICON  gold-400 (--brand-accent), always, which on the
 *                          light card is 1.59:1 - roughly half the 3:1 floor
 *                          WCAG 2.2 SC 1.4.11 sets for graphical objects, and
 *                          a flat breach of the CLAUDE.md colour law, "never
 *                          paint gold-400 as text or a fill on a light card
 *                          body".
 *   the EYEBROW            gold-800 (--brand-accent-strong), always, which on
 *                          the photo hero is 2.70:1 against a 4.5:1 floor
 *                          (SC 1.4.3, normal text; the eyebrow is 12px), and
 *                          contradicts the CLAUDE.md hero law, "a GOLD
 *                          eyebrow, --brand-accent on the dark hero".
 *
 * The two tiers are NOT interchangeable and the choice between them IS the
 * surface decision. Getting it backwards is not a near miss, it is the worst
 * available answer: each tier is close to its own floor on its own surface and
 * far under it on the other.
 *
 * WHY A GUARD RATHER THAN A TEST. `tinted-text-meets-contrast.mjs` already
 * computes this class of ratio, and it names in its own header the gap this
 * defect fell through: "a text colour with no background in the same class
 * string - it inherits from an ancestor this cannot see". That is exactly the
 * shape here. The icon's colour is on the icon; the surface is on the component
 * root. No amount of per-string contrast arithmetic reaches it, and a test
 * naming CategoryHeroEmpty would be one more hand-written list that cannot
 * contain the file nobody adds to it - the precise failure that guard was
 * written to end.
 *
 * WHAT IT CHECKS, in two clauses, both decidable from the source alone.
 *
 *   SCOPE. A file is in scope when it declares a SURFACE FLAG: a bare
 *   identifier `f` used as `f ? A : B` where one arm names a DARK surface
 *   background token and the other a LIGHT one. That is a component which
 *   renders on both surfaces, said by the file about itself. A one-off
 *   status pill (`state === 'live' ? ... : ...`) is not a bare identifier and
 *   is not in scope; nor is a badge fill that is not a surface token
 *   (`bg-success`). Both were checked against the real tree and both are
 *   correctly excluded.
 *
 *   CLAUSE 1  Every gold foreground (`text-`/`fill-`/`stroke-` of
 *             --brand-accent or --brand-accent-strong) in an in-scope file
 *             must sit inside a ternary on one of that file's surface flags.
 *
 *   CLAUSE 2  Inside such a ternary, the DARK arm must not carry gold-800 and
 *             the LIGHT arm must not carry gold-400. A branch pointing the
 *             wrong way round satisfies clause 1 and is just as broken, so
 *             clause 1 alone would be a gate that can be passed by the bug.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, named rather than hidden:
 *   - opacity composites (`bg-[var(--brand-accent)]/10`). What they paint
 *     depends on what is behind them; axe measures those on the real surface.
 *   - the 130 files that use a gold foreground and declare NO surface flag.
 *     They render on one surface and this guard cannot tell which. That half
 *     belongs to axe and to the viewport proofs.
 *   - whether the surface flag is wired to the right prop. It reads colours,
 *     not intent.
 *
 * Run: node scripts/guards/surface-flag-colours-branch.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[surface-flag-colours-branch]'

/* ── The token table, READ from globals.css so this can never carry a stale
 *    copy of a colour the founder has since retuned. ───────────────────────── */
const CSS = join(ROOT, 'src/app/globals.css')
const cssText = readFileSync(CSS, 'utf8')
const TOKENS = new Map()
for (const m of cssText.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) {
  TOKENS.set(m[1], m[2].toUpperCase())
}
/** --brand-accent and --brand-accent-strong are aliases; resolve them. */
function aliasOf(name) {
  const m = cssText.match(new RegExp(`--${name}:\\s*var\\(--color-([a-z0-9-]+)\\)`))
  return m ? m[1] : null
}
const GOLD_PLAIN = aliasOf('brand-accent')
const GOLD_STRONG = aliasOf('brand-accent-strong')
if (!GOLD_PLAIN || !GOLD_STRONG || !TOKENS.get(GOLD_PLAIN) || !TOKENS.get(GOLD_STRONG)) {
  console.error(`${TAG} FAIL - could not resolve --brand-accent / --brand-accent-strong to hex values in`)
  console.error(`  ${relative(ROOT, CSS)}. A guard that cannot read its own tokens cannot report a pass.`)
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
const contrast = (a, b) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
/** Representative surfaces, for the numbers printed in a failure message. */
const LIGHT_REF = TOKENS.get(aliasOf('surface-1') ?? 'ink-100') ?? TOKENS.get('ink-100')
const DARK_REF = TOKENS.get('navy-950')
const ratio = {
  plainOnLight: contrast(TOKENS.get(GOLD_PLAIN), LIGHT_REF),
  plainOnDark: contrast(TOKENS.get(GOLD_PLAIN), DARK_REF),
  strongOnLight: contrast(TOKENS.get(GOLD_STRONG), LIGHT_REF),
  strongOnDark: contrast(TOKENS.get(GOLD_STRONG), DARK_REF),
}

/* ── Detection ────────────────────────────────────────────────────────────── */
const DARK_SURFACE = [/bg-\[var\(--color-navy-/, /bg-\[var\(--surface-dark\)\]/, /bg-navy-\d/]
const LIGHT_SURFACE = [/bg-\[var\(--surface-[1-9]\)\]/, /bg-white\b/, /bg-canvas\b/, /bg-ink-[01]\d\d/]

const GOLD_ANY = /(?:text|fill|stroke)-\[var\(--brand-accent(?:-strong)?\)\]/g
const GOLD_PLAIN_RE = /(?:text|fill|stroke)-\[var\(--brand-accent\)\]/
const GOLD_STRONG_RE = /(?:text|fill|stroke)-\[var\(--brand-accent-strong\)\]/

/** `flag ? armA : armB`, condition a bare identifier, optionally negated. */
const FLAG_TERNARY = /(!?)([A-Za-z_$][\w$]*)\s*\?([^?]{0,300}?):([^?{};]{0,300}?)(?=[,}\n`])/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}
const relPath = (f) => relative(ROOT, f).split(sep).join('/')
const lineOf = (src, index) => src.slice(0, index).split('\n').length

/*
 * The scan root is `src`. It is overridable ONLY so that the vacuous-pass
 * refusal below can be executed rather than described: the drill harness
 * mutates one file per drill, and emptying the scope needs every surface-flagged
 * file gone at once. tests/unit/a11y/hero-empty-gold-tiers.test.ts points this
 * at a fixture holding no surface flag and asserts the refusal.
 *
 * A redirect can therefore never be silent: the root is printed on EVERY run,
 * pass or fail, so a scan of somewhere other than src/ is visible in the build
 * log rather than inferred from an exit code.
 */
const SCAN_ROOT = process.env.SURFACE_FLAG_SCAN_ROOT
  ? join(ROOT, process.env.SURFACE_FLAG_SCAN_ROOT)
  : join(ROOT, 'src')
const files = walk(SCAN_ROOT)
const violations = []
const unreadable = []
let inScopeFiles = 0
let goldChecked = 0

for (const full of files) {
  let src
  try {
    src = readFileSync(full, 'utf8')
  } catch (cause) {
    unreadable.push(`${relPath(full)} (${cause.message})`)
    continue
  }
  if (!GOLD_ANY.test(src)) {
    GOLD_ANY.lastIndex = 0
    continue
  }
  GOLD_ANY.lastIndex = 0

  // Surface flags, with the polarity the surface branch itself establishes.
  const flags = new Map() // name -> { trueIsDark, evidence }
  for (const m of src.matchAll(FLAG_TERNARY)) {
    const [, negated, name, armA, armB] = m
    const aD = DARK_SURFACE.some((r) => r.test(armA)), aL = LIGHT_SURFACE.some((r) => r.test(armA))
    const bD = DARK_SURFACE.some((r) => r.test(armB)), bL = LIGHT_SURFACE.some((r) => r.test(armB))
    let trueIsDark = null
    if (aD && bL) trueIsDark = true
    else if (aL && bD) trueIsDark = false
    if (trueIsDark === null) continue
    if (negated === '!') trueIsDark = !trueIsDark
    flags.set(name, { trueIsDark, evidence: m[0].trim().replace(/\s+/g, ' ').slice(0, 120) })
  }
  if (flags.size === 0) continue
  inScopeFiles += 1
  const rel = relPath(full)

  // Ternaries controlled by one of those flags, with each arm's surface known.
  const guarded = []
  for (const m of src.matchAll(FLAG_TERNARY)) {
    const [, negated, name, armA, armB] = m
    const flag = flags.get(name)
    if (!flag) continue
    const trueIsDark = negated === '!' ? !flag.trueIsDark : flag.trueIsDark
    guarded.push({
      start: m.index,
      end: m.index + m[0].length,
      name,
      darkArm: trueIsDark ? armA : armB,
      lightArm: trueIsDark ? armB : armA,
      text: m[0].trim().replace(/\s+/g, ' ').slice(0, 140),
    })
  }

  for (const o of src.matchAll(GOLD_ANY)) {
    goldChecked += 1
    const t = guarded.find((g) => o.index >= g.start && o.index < g.end)
    if (!t) {
      violations.push({
        clause: 1,
        file: rel,
        line: lineOf(src, o.index),
        found: o[0],
        flags: [...flags.keys()].join(', '),
      })
      continue
    }
    // CLAUSE 2, judged per arm rather than per occurrence, deduplicated below.
    if (GOLD_STRONG_RE.test(t.darkArm)) {
      violations.push({ clause: 2, file: rel, line: lineOf(src, t.start), found: t.text, arm: 'dark', wrong: 'strong' })
    } else if (GOLD_PLAIN_RE.test(t.lightArm)) {
      violations.push({ clause: 2, file: rel, line: lineOf(src, t.start), found: t.text, arm: 'light', wrong: 'plain' })
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

if (inScopeFiles === 0) {
  console.error('')
  console.error(`${TAG} FAIL - no file in ${relPath(SCAN_ROOT)} declares a surface flag any more.`)
  console.error('  This guard had two subjects when it was written (CategoryHeroEmpty and')
  console.error('  CommunityOrganiserCtaPanel). Matching nothing means the detector has')
  console.error('  stopped seeing the shape, not that the platform is clean, and a guard that')
  console.error('  passes vacuously is worse than no guard. If both components really were')
  console.error('  removed, delete this guard and its drills in the same commit rather than')
  console.error('  leaving it here reporting a pass it cannot justify.')
  process.exit(1)
}

// Clause 2 fires once per gold occurrence inside the offending ternary; report once.
const unique = []
const seen = new Set()
for (const v of violations) {
  const key = `${v.clause}:${v.file}:${v.line}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(v)
}

if (unique.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${unique.length} gold foreground(s) that do not follow their surface:`)
  for (const v of unique) {
    if (v.clause === 1) {
      console.error(`    ${v.file}:${v.line}  ${v.found} is painted unconditionally`)
      console.error(`      but this file renders on two surfaces (flag: ${v.flags}).`)
    } else {
      console.error(`    ${v.file}:${v.line}  the ${v.arm} arm carries the ${v.wrong === 'strong' ? 'gold-800' : 'gold-400'} tier, which is the wrong way round:`)
      console.error(`      ${v.found}`)
    }
  }
  console.error('')
  console.error(`  The two tiers measured against the reference surfaces, computed from`)
  console.error(`  ${relative(ROOT, CSS).split(sep).join('/')} on this run, not from memory:`)
  console.error(`    --brand-accent        (${GOLD_PLAIN}, ${TOKENS.get(GOLD_PLAIN)})  on dark ${ratio.plainOnDark.toFixed(2)}:1   on light ${ratio.plainOnLight.toFixed(2)}:1`)
  console.error(`    --brand-accent-strong (${GOLD_STRONG}, ${TOKENS.get(GOLD_STRONG)})  on dark ${ratio.strongOnDark.toFixed(2)}:1   on light ${ratio.strongOnLight.toFixed(2)}:1`)
  console.error('')
  console.error('  WCAG 2.2 SC 1.4.3 sets 4.5:1 for normal text and SC 1.4.11 sets 3:1 for a')
  console.error('  graphical object. Pick the tier by the surface:')
  console.error("    flag ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]'")
  console.error('  src/components/features/community/community-organiser-cta.tsx is the')
  console.error('  worked example: one `isDark`, every colour decision beside it.')
  process.exit(1)
}

declareWork('surface-flag-colours-branch', {
  did: {
    [`file scanned under ${relPath(SCAN_ROOT)}`]: files.length,
    'file declaring a surface flag': inScopeFiles,
    'gold foreground judged': goldChecked,
  },
  found: { 'gold foreground that ignores its surface': 0 },
  zeroIsFine: {
    'gold foreground that ignores its surface':
      'every gold foreground in a two-surface component branching with it is the goal state; two did not in CategoryHeroEmpty on 19 September 2026',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - ${goldChecked} gold foreground(s) across ${inScopeFiles} two-surface component(s), every one branching with its surface.`,
)
process.exit(0)
