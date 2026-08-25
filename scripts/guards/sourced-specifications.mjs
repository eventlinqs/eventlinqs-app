// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * Law 7 enforcement: a third-party specification must carry its source.
 *
 * WHAT LAW 7 SAYS. No recommendation, specification, dimension, limit, price,
 * format, register or platform behaviour may be stated from memory. Fetch the
 * primary source and cite it, or mark the claim UNSOURCED.
 *
 * WHAT A GUARD CAN AND CANNOT DO, said plainly rather than pretended around. No
 * static check can judge whether prose is well researched. A guard that demanded a
 * citation beside every numeral in this repository would fire thousands of times
 * on spacing tokens, test fixtures and pixel maths, and would be switched off
 * inside a day. A gate nobody keeps is worse than no gate, because it converts a
 * law into a formality.
 *
 * So this narrows to the shape that actually caused harm: a claim about SOMEBODY
 * ELSE'S platform. Every incident recorded in Law 7 is one of those. An Instagram
 * aspect ratio, a Meta minimum resolution, an Eventbrite statement descriptor, a
 * Vercel CLI capability. Those are exactly the claims that cannot be derived by
 * thinking and must be fetched.
 *
 * THE RULE. A line that names a third party AND asserts a specification-shaped
 * value must carry, on that line or within a few lines above it, either a URL or
 * the word UNSOURCED.
 *
 * Exit 0 = every third-party specification is sourced or honestly marked.
 * Exit 1 = at least one is stated from nowhere. Build gate.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Third parties whose behaviour we cannot derive and must fetch. */
const THIRD_PARTIES = [
  'instagram', 'meta', 'facebook', 'threads', 'tiktok', 'linkedin', 'whatsapp',
  'reddit', 'twitter', 'stripe', 'google', 'apple', 'vercel', 'supabase',
  'upstash', 'resend', 'sentry', 'eventbrite', 'ticketmaster', 'dice',
  'humanitix', 'trybooking', 'moshtix', 'oztix',
]
const THIRD_PARTY_RE = new RegExp(`\\b(${THIRD_PARTIES.join('|')})\\b`, 'i')

/**
 * Specification-shaped assertions.
 *
 * Kept narrow on purpose. A bare number is not a specification; a pixel PAIR or an
 * aspect RATIO next to a platform name is.
 */
const SPEC_PATTERNS = [
  { re: /\b\d{3,4}\s*[x×]\s*\d{3,4}\b/, kind: 'pixel dimensions' },
  // NO whitespace permitted around the colon. An aspect ratio is written 4:5,
  // 16:9 or 1.91:1; a colon with a space after it is ordinary punctuation. The
  // first version allowed spaces and therefore read "Part 1: 4/5 done" as a
  // ratio, which is the kind of false positive that gets a guard switched off.
  { re: /\b\d{1,2}(?:\.\d+)?:\d{1,2}(?:\.\d+)?\b/, kind: 'aspect ratio' },
]

/** A citation, or an honest admission that there is not one. */
const CITED = /https?:\/\/|UNSOURCED/

/**
 * Colon-separated pairs that are NOT aspect ratios. Each of these was a real false
 * positive on the first run, and each would have taught a reader to ignore the
 * guard, which is how a gate dies.
 *
 *   contrast   `4.5:1` next to WCAG is a CONTRAST ratio, an accessibility floor
 *   time       `21:43 AEST` in a merge timestamp is a TIME
 *   ranges     a version or a port range is not a specification about a platform
 */
const NOT_A_RATIO = [
  /contrast|wcag|\bAA+\b|luminance/i,
  /\b\d{4}-\d{2}-\d{2}\b|AEST|AEDT|UTC|GMT|\b[ap]\.?m\.?\b/i,
  /localhost|:\d{4}\b\/|port\s/i,
  // A CLOCK TIME is not a ratio. Added 12 August 2026 after `daily at 03:30`,
  // a cron schedule on a line that also said `vercel.json`, was reported as an
  // unsourced third-party aspect ratio.
  //
  // DELIBERATELY NARROW, because the lazy fix here is a blanket skip of
  // anything containing a colon, which would stop this guard seeing 4:5, 9:16
  // and 1.91:1 and would quietly end its usefulness.
  //
  // Rule one: a LEADING-ZERO 24-hour time. `03:30` cannot be an aspect ratio,
  // because nobody writes `09:16` for 9:16. Ratios that look time-shaped
  // WITHOUT the leading zero, notably 16:10 and 21:9, are real and are left
  // alone by this pattern.
  /\b0\d:[0-5]\d\b/,
  // Rule two: a time without the leading zero, but only when a scheduling word
  // sits within a couple of dozen characters of it, which is what separates
  // "runs daily at 3:30" from a bare ratio.
  /\b(?:daily|nightly|hourly|weekly|midnight|noon|cron)\b[^\n]{0,24}\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i,
]

const SCAN_DIRS = ['docs', 'src', 'scripts']
const SCAN_EXT = new Set(['.md', '.ts', '.tsx', '.mjs', '.cjs', '.js'])
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'benchmark', 'redesign', 'sprint1', 'm6',
  'modules', 'design', 'perf', 'roast', 'verification', 'lighthouse',
])

/**
 * Reviewed baseline, each with the reason. Printed on every run and checked for
 * staleness, the same shape as the RLS baseline, so it cannot rot into an
 * unexamined allowlist.
 */
export const REVIEWED = {
  'docs/security/AUDIT-2026-08-08-SECTIONS-2-8.md':
    'Security findings quote third-party advisory ranges and version numbers, each ' +
    'already carrying its GHSA link or its file:line evidence.',
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    console.warn('[scripts/guards/sourced-specifications:120]', error instanceof Error ? error.message : error)
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue
    const full = path.join(dir, e)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (SCAN_EXT.has(path.extname(e))) out.push(full)
  }
  return out
}

const findings = []
const reviewedHit = new Set()
let scanned = 0

for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (REVIEWED[rel]) {
      reviewedHit.add(rel)
      continue
    }
    let lines
    try {
      lines = readFileSync(file, 'utf8').split('\n')
    } catch (error) {
      console.warn('[scripts/guards/sourced-specifications:153]', error instanceof Error ? error.message : error)
      continue
    }
    scanned++

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!THIRD_PARTY_RE.test(line)) continue
      const spec = SPEC_PATTERNS.find((p) => p.re.test(line))
      if (!spec) continue
      // A citation may sit on the line, or in the few lines above it, because a
      // prose paragraph often cites once and then states several values.
      const window = lines.slice(Math.max(0, i - 4), i + 2).join('\n')

      // The not-a-ratio test reads the SAME window, not just the line. Whether
      // `4.5:1` is a contrast floor or an aspect ratio is decided by the sentence
      // around it, and prose wraps: in event-share-bar.tsx the words "AA contrast"
      // sit two lines above the number they qualify.
      if (spec.kind === 'aspect ratio' && NOT_A_RATIO.some((re) => re.test(window))) continue
      if (CITED.test(window)) continue

      findings.push({
        rel,
        line: i + 1,
        kind: spec.kind,
        text: line.trim().slice(0, 110),
      })
    }
  }
}

// Always printed. A baseline nobody reads is an allowlist that rots.
if (reviewedHit.size) {
  console.log(`[sourced-specifications] ${reviewedHit.size} reviewed file(s), skipped with a stated reason:`)
  for (const r of [...reviewedHit].sort()) console.log(`    ${r}: ${REVIEWED[r]}`)
  console.log('')
}
const stale = Object.keys(REVIEWED).filter((r) => !reviewedHit.has(r))
if (stale.length) {
  console.log(`[sourced-specifications] ${stale.length} reviewed entry(ies) match nothing now - delete the line:`)
  for (const r of stale) console.log(`    ${r}`)
  console.log('')
}

if (findings.length) {
  console.error(
    `[sourced-specifications] FAIL - ${findings.length} third-party specification(s) stated\n` +
      `with no source. Law 7: fetch the primary source and cite it, or mark it UNSOURCED.\n`,
  )
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  (${f.kind})`)
    console.error(`      ${f.text}`)
  }
  console.error(
    `\nFix by adding the URL you fetched it from on or just above the line, or by\n` +
      `writing UNSOURCED if no primary source can be found. An honest gap outranks a\n` +
      `confident guess.`,
  )
  process.exit(1)
}

console.log(
  `[sourced-specifications] PASS - ${scanned} files scanned, every third-party specification is sourced or marked UNSOURCED.`,
)
