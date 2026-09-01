/**
 * NO GLASSMORPHISM. A build-failing guard for a founder-locked design law.
 *
 * CLAUDE.md, Design system, "Light and airy: no glassmorphism, no flat-dark
 * (founder-locked boundary)":
 *
 *   "Surfaces are solid and opaque. No glassmorphism anywhere: no
 *    backdrop-filter / backdrop-blur chrome. Both competitors use solid
 *    headers, filter bars, and badges; so do we. Translucency without a
 *    backdrop-filter (a /95 badge) is not glassmorphism and is allowed."
 *
 * Motion repeats it in its forbidden list, beside GSAP, scroll-hijacking and
 * bento grids.
 *
 * WHY THIS EXISTS RATHER THAN TRUSTING THE LAW. On 2026-09-02 a launch
 * readiness audit found `src/components/ui/glass-card.tsx` carrying
 * `backdrop-blur-2xl` on its dark variant and `backdrop-blur-md` on a light
 * variant that nothing used. The component was imported by two live surfaces.
 * The law had been written, restated in two sections, and applied once already
 * to the site header, whose own comment records the frosted treatment being
 * removed for legibility. It still survived in a file, because nothing looked.
 *
 * The constitution's own words: a law with no enforcement is a preference.
 *
 * WHAT IS ALLOWED, deliberately, so this guard does not overreach:
 *   - translucency with no filter: `bg-white/95`, `bg-ink-900/[0.92]`
 *   - the word in a COMMENT, which is how the law gets explained in code
 *   - a `transition-[...]` property list naming backdrop-filter while no
 *     backdrop-filter is ever applied. That is inert, and the site header
 *     carries one as a leftover.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')

const EXTENSIONS = ['.ts', '.tsx', '.css']
const PATTERN = /backdrop-blur|backdrop-filter/

/**
 * Every I/O failure below is REPORTED rather than swallowed. A directory this
 * cannot read is a directory this cannot police, and a guard that silently
 * scans less than it claims is the exact shape of a gate that passes because it
 * looked at nothing. `no-silent-catch` enforces that, and it caught this file on
 * its first build.
 */
const unreadable = []
const files = []
;(function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    unreadable.push(`${relative(ROOT, dir)} (readdir: ${error.code ?? error.message})`)
    console.warn(`no-glassmorphism: could not read directory ${dir}: ${error.message}`)
    return
  }
  for (const name of entries) {
    const p = join(dir, name)
    let s
    try {
      s = statSync(p)
    } catch (error) {
      unreadable.push(`${relative(ROOT, p)} (stat: ${error.code ?? error.message})`)
      console.warn(`no-glassmorphism: could not stat ${p}: ${error.message}`)
      continue
    }
    if (s.isDirectory()) walk(p)
    else if (EXTENSIONS.includes(extname(p))) files.push(p)
  }
})(SRC)

/**
 * A line is a violation only if it APPLIES the treatment. A comment explaining
 * the ban, and a transition property list naming a filter nothing sets, are
 * both the law being obeyed rather than broken.
 */
function isComment(line) {
  const t = line.trim()
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')
}
function isInertTransitionList(line) {
  return /transition-\[[^\]]*backdrop-filter[^\]]*\]/.test(line)
}

const violations = []
let linesScanned = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    unreadable.push(`${relative(ROOT, file)} (read: ${error.code ?? error.message})`)
    console.warn(`no-glassmorphism: could not read ${file}: ${error.message}`)
    continue
  }
  const lines = text.split(/\r?\n/)
  linesScanned += lines.length
  lines.forEach((line, i) => {
    if (!PATTERN.test(line)) return
    if (isComment(line)) return
    if (isInertTransitionList(line)) return
    violations.push({
      file: relative(ROOT, file).replace(/\\/g, '/'),
      line: i + 1,
      text: line.trim().slice(0, 120),
    })
  })
}

console.log(
  `no-glassmorphism: ${files.length} file(s) under src, ${linesScanned} line(s) scanned`,
)
console.log('  looking for: applied backdrop-blur / backdrop-filter')
console.log('  allowed: translucency with no filter, comments, inert transition property lists')

// A guard that could not read part of the tree must say so, or "no violations"
// is indistinguishable from "no look".
if (unreadable.length > 0) {
  console.error('')
  console.error(`[no-glassmorphism] FAIL - ${unreadable.length} path(s) could not be read:`)
  for (const u of unreadable) console.error(`    ${u}`)
  console.error('  A guard that scanned less than the whole tree cannot report a pass.')
  process.exit(1)
}

if (violations.length === 0) {
  console.log('[no-glassmorphism] PASS - no backdrop-filter is applied anywhere in src.')
  process.exit(0)
}

console.error('')
console.error(`[no-glassmorphism] FAIL - ${violations.length} applied backdrop-filter(s):`)
for (const v of violations) {
  console.error(`    ${v.file}:${v.line}`)
  console.error(`      ${v.text}`)
}
console.error('')
console.error('  CLAUDE.md, Design system: "Surfaces are solid and opaque. No')
console.error('  glassmorphism anywhere: no backdrop-filter / backdrop-blur chrome."')
console.error('')
console.error('  Translucency WITHOUT a filter is allowed and is usually the fix:')
console.error('  drop the blur and raise the opacity, for example bg-ink-900/[0.92].')
process.exit(1)
