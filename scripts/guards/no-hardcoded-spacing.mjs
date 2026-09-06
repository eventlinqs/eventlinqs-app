/**
 * NO HARDCODED SPACING (close-out C14.12, 6 September 2026).
 *
 * "One spacing scale. A guard fails the build on any hardcoded spacing value."
 *
 * The scale is the 4px scale the design system already declares: Tailwind's
 * spacing utilities (`p-4`, `mt-1.5`, `gap-3`, all multiples of 0.25rem) and
 * the `--space-*` tokens in src/app/globals.css. A spacing value is HARDCODED
 * when it steps off that scale by hand:
 *
 *   1. an arbitrary spacing utility whose value is a raw length that is not a
 *      multiple of 4px: `pl-[13px]`, `mt-[0.3rem]`, `gap-[18px]`
 *   2. an inline style or a CSS declaration for padding, margin, gap or an
 *      inset carrying such a length: `style={{ padding: '2px 6px' }}`,
 *      `margin-top: 7px`
 *
 * A `var(--space-*)` (or any `var(--...)`) value is a token and passes. Zero
 * passes. `auto`, percentages, `calc()`, `em` and viewport units pass: they are
 * relationships, not steps. A multiple of 4px passes (`pl-[3.25rem]` is 52px,
 * `lg:mr-[20rem]` is 320px), because the scale is the grid, not the utility
 * names.
 *
 * Out of scope, on purpose: widths, heights, translations and font sizes are
 * not spacing (the type scale has its own measurement in C14); the broadcast
 * renderers under src/lib/broadcast/ lay out PIXELS on a canvas, a poster and
 * a PDF, where 4px has no meaning; and the generated critical-CSS fixture
 * under src/app/dev/ is a build artefact, not authored style.
 *
 * Exit 1 with every offending line, or exit 0 with the count of files scanned.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

const EXCLUDED_PREFIXES = ['src/lib/broadcast/', 'src/app/dev/']
const EXTENSIONS = new Set(['.ts', '.tsx', '.css'])

/** Spacing utility prefixes Tailwind exposes; widths, heights and translations are deliberately absent. */
const UTILITY = String.raw`(?:-?(?:m|p)[trblxyse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|scroll-m[trblxy]?|scroll-p[trblxy]?)`
const VARIANT = String.raw`(?:[\w-]+:)*`
const ARBITRARY = new RegExp(String.raw`(?<![\w./-])${VARIANT}${UTILITY}-\[([^\]]+)\]`, 'g')

/** Inline style keys (camelCase) and CSS properties (kebab-case) that are spacing, exact names only. */
const SIDES_CAMEL = String.raw`(?:Top|Right|Bottom|Left|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?`
const SIDES_KEBAB = String.raw`(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?`
const CAMEL_PROPERTY = String.raw`(?:(?:padding|margin)${SIDES_CAMEL}|gap|rowGap|columnGap|inset(?:Inline|Block)?(?:Start|End)?|top|right|bottom|left)`
const KEBAB_PROPERTY = String.raw`(?:(?:padding|margin)${SIDES_KEBAB}|gap|row-gap|column-gap|inset(?:-(?:inline|block))?(?:-(?:start|end))?|top|right|bottom|left)`
const CSS_DECL = new RegExp(String.raw`(?<![\w-])(${KEBAB_PROPERTY})\s*:\s*([^;{}]+?)\s*(?:;|$)`, 'gm')
const STYLE_KEY = new RegExp(String.raw`(?<![\w-])(${CAMEL_PROPERTY})\s*:\s*(['"\x60])([^'"\x60]+)\2`, 'g')

/** CSS block comments become spaces (newlines kept), so prose inside them is never read as a declaration. */
function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** Split a value on whitespace that sits OUTSIDE parentheses, so `env(safe-area-inset-bottom, 0px)` is one term. */
function splitTerms(value) {
  const terms = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (/\s/.test(ch) && depth === 0) {
      if (cur) terms.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur) terms.push(cur)
  return terms
}

export function isOnScale(value) {
  const v = value.trim()
  if (v === '' || v === '0' || v === 'auto' || v === 'inherit' || v === 'initial' || v === 'unset') return true
  if (/^var\(--[\w-]+(?:\s*,.*)?\)$/.test(v)) return true
  if (/^(calc|min|max|clamp|env)\(/.test(v)) return true
  if (/^-?[\d.]+(%|em|ch|vw|vh|vmin|vmax|dvh|svh|lvh|fr)$/.test(v)) return true
  const px = v.match(/^-?([\d.]+)px$/)
  if (px) return Math.abs((Number(px[1]) / 4) % 1) < 1e-9
  const rem = v.match(/^-?([\d.]+)rem$/)
  if (rem) return Math.abs((Number(rem[1]) / 0.25) % 1) < 1e-9
  return false
}

/** Every space-separated term of a shorthand must be on the scale. */
export function offendingTerms(value) {
  // an arbitrary Tailwind value writes spaces as underscores
  const terms = splitTerms(value.replace(/_/g, ' '))
  return terms.filter((t) => !isOnScale(t))
}

export function findViolations(source, file) {
  const out = []
  const lines = (file.endsWith('.css') ? stripCssComments(source) : source).split('\n')
  lines.forEach((line, i) => {
    if (/\bspacing-guard:\s*ignore\b/.test(line)) return
    for (const m of line.matchAll(ARBITRARY)) {
      const bad = offendingTerms(m[1])
      if (bad.length) out.push({ file, line: i + 1, kind: 'utility', text: m[0], bad })
    }
    if (file.endsWith('.css')) {
      for (const m of line.matchAll(CSS_DECL)) {
        if (/^--/.test(m[1])) continue
        const bad = offendingTerms(m[2].replace(/!important/, ''))
        if (bad.length) out.push({ file, line: i + 1, kind: 'css', text: `${m[1]}: ${m[2]}`, bad })
      }
    } else {
      for (const m of line.matchAll(STYLE_KEY)) {
        const bad = offendingTerms(m[3])
        if (bad.length) out.push({ file, line: i + 1, kind: 'style', text: `${m[1]}: ${m[3]}`, bad })
      }
    }
  })
  return out
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      yield* walk(full)
    } else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) {
      yield full
    }
  }
}

export function scanTree(root = SRC) {
  const violations = []
  let files = 0
  for (const full of walk(root)) {
    const rel = relative(ROOT, full).split(sep).join('/')
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue
    files += 1
    violations.push(...findViolations(readFileSync(full, 'utf8'), rel))
  }
  return { files, violations }
}

const invokedDirectly = process.argv[1] && /no-hardcoded-spacing\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const { files, violations } = scanTree()
  if (violations.length) {
    console.error(`FAIL no-hardcoded-spacing: ${violations.length} spacing value(s) off the spacing scale (4px steps or a --space token):`)
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.text}  <- ${v.bad.join(', ')}`)
    process.exit(1)
  }
  console.log(`no-hardcoded-spacing: ${files} files, every spacing value on the scale`)
}
