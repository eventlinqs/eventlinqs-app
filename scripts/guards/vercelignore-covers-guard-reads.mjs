/**
 * ANYTHING THE PREBUILD CHAIN READS THROUGH .vercelignore MUST SURVIVE IT.
 *
 * .vercelignore excludes docs/* so the deployment upload stays small, and FOUR
 * deployments have now been lost to a prebuild script reading a file that never
 * arrived. Its own header records all four. This guard runs in the same prebuild
 * chain, so the fault is caught on the local gate before Vercel sees the commit.
 *
 * WHAT IT JUDGES, and what changed after the fourth (close-out F1.9.2 PART TWO).
 *
 *   1. REQUIRED READS SURVIVE. Every path in REQUIRED_READS must exist, must
 *      still be named by a build-time script (so an entry cannot outlive its
 *      reader), and must NOT be excluded, under the gitignore semantics Vercel
 *      inherits, including the rule that a file inside an excluded DIRECTORY can
 *      never be re-included.
 *
 *   2. IT PRINTS THE EXACT LINES. When a required path is excluded, the failure
 *      names the lines to add, DERIVED from the path itself. It used to say
 *      "re-include it level by level: !dir/, dir/*, !dir/file", which makes the
 *      reader do the walk-down by hand, and one of the four lost deployments was
 *      that derivation done wrong.
 *
 *   3. THE GRAMMAR IS UNDERSTOOD OR REFUSED. A pattern outside the small grammar
 *      (globstar, character classes, a wildcard anywhere but a final slash-star)
 *      is a fault rather than a guess about what Vercel would do with it.
 *
 * WHAT IS NO LONGER HERE, and this is the point of F1.9.2. There WAS a second
 * list: build-time scripts "reviewed as tolerant of an absent docs/", each with a
 * written reason. On 8 September 2026 one of those reasons was wrong, nothing had
 * ever executed it, and this guard passed on the strength of it while the
 * deployment it was written to protect died. A rationale does not run.
 *
 * The list is deleted. excluded-reads-survive-the-upload.mjs now RUNS every
 * prebuild entry point whose code names a path under a top level .vercelignore
 * excludes, inside a materialised upload, and fails on any non-zero exit. Its
 * subject is derived from the import graph, not written down, so there is no
 * second list to disagree with this one.
 *
 * NOT LIMITED TO docs/ (close-out F1.9.3). The excluded top levels are read out
 * of .vercelignore itself, so design-captures, research and audit-v2 are already
 * covered and the next exclusion is covered the day it is added.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs, including against commit
 * 7564b40's own .vercelignore, which it must refuse.
 *
 * Run: node scripts/guards/vercelignore-covers-guard-reads.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { makeJudgeIgnored, parseVercelIgnore } from './lib/vercelignore.mjs'
import { REQUIRED_READS } from './lib/vercelignore-registry.mjs'
import {
  buildTimeScripts,
  entriesThatReadThroughTheIgnore,
  excludedTopLevels,
  pathLiterals,
  reinclusionLines,
} from './lib/build-time-scripts.mjs'

const ROOT = process.cwd()
const TAG = '[vercelignore-covers-guard-reads]'
const IGNORE_FILE = '.vercelignore'

/**
 * The files that name these paths as SUBJECT MATTER rather than reading them:
 * this guard, its executor, and the two modules that hold the mechanism. Without
 * this, the registry naming its own key would satisfy the "still named by a
 * reader" check and an entry could outlive the guard that reads it, which is the
 * rot this check exists to catch.
 */
const MECHANISM = new Set([
  'scripts/guards/vercelignore-covers-guard-reads.mjs',
  'scripts/guards/excluded-reads-survive-the-upload.mjs',
  'scripts/guards/lib/vercelignore-registry.mjs',
  'scripts/guards/lib/build-time-scripts.mjs',
])

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

// ---------------------------------------------------------------------------
// 1. Parse .vercelignore into rules, refusing anything outside the grammar.
// ---------------------------------------------------------------------------
if (!existsSync(join(ROOT, IGNORE_FILE))) {
  fail(`${IGNORE_FILE} is missing from the repository root`)
}
const ignoreText = existsSync(join(ROOT, IGNORE_FILE)) ? readFileSync(join(ROOT, IGNORE_FILE), 'utf8') : ''
const { rules, errors: ignoreErrors } = parseVercelIgnore(ignoreText)
for (const e of ignoreErrors) fail(`${IGNORE_FILE} ${e}`)

/** A path is ignored by its own last matching rule, or by an excluded ancestor. */
const judgeIgnored = makeJudgeIgnored(rules)

// ---------------------------------------------------------------------------
// 2. Enumerate the build-time scripts and every path they name that reaches
//    THROUGH .vercelignore, whichever top level it sits under.
// ---------------------------------------------------------------------------
const scanned = buildTimeScripts(ROOT)
const topLevels = excludedTopLevels(rules)
const literals = pathLiterals(ROOT, scanned).filter(({ literal }) => topLevels.has(literal.split('/')[0]))

const namedBy = new Map()
for (const { file, literal } of literals) {
  if (MECHANISM.has(file)) continue
  if (!namedBy.has(literal)) namedBy.set(literal, new Set())
  namedBy.get(literal).add(file)
}
/** A directory entry is named when any literal sits at or under it. */
const isNamed = (path) => {
  if (namedBy.has(path)) return true
  const dir = path.endsWith('/') ? path.slice(0, -1) : path
  for (const literal of namedBy.keys()) {
    if (literal === dir || literal.startsWith(`${dir}/`)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 3. Judge the required reads, and derive the fix.
// ---------------------------------------------------------------------------
const ignoreLines = ignoreText.split(/\r?\n/).map((l) => l.trim())

for (const [path, reason] of Object.entries(REQUIRED_READS)) {
  const isDir = path.endsWith('/')
  const onDisk = join(ROOT, isDir ? path.slice(0, -1) : path)
  if (!existsSync(onDisk)) {
    fail(`the REQUIRED read ${path} does not exist in the tree (${reason})`)
    continue
  }
  if (isDir && !statSync(onDisk).isDirectory()) {
    fail(`${path} ends in a slash, so it is declared as a directory, and it is a file`)
  }
  if (isDir && readdirSync(onDisk).length === 0) {
    fail(`the REQUIRED directory ${path} is empty, so nothing it is re-included for would arrive (${reason})`)
  }
  if (!isNamed(path)) {
    fail(`the REQUIRED read ${path} is named by no build-time script; the registry entry has rotted (${reason})`)
  }

  // A directory is judged by a probe path inside it, because the ignore rules
  // decide files. An excluded ancestor seals the directory either way.
  const probe = isDir ? `${path}probe` : path
  const verdict = judgeIgnored(probe)
  const missing = reinclusionLines(path).filter((line) => !ignoreLines.includes(line))
  if (verdict.ignored || missing.length > 0) {
    fail(
      `${path} does not survive ${IGNORE_FILE}${verdict.ignored ? ` (${verdict.by})` : ''}; ` +
        `every Vercel build will die with ENOENT on it. ${reason}.\n` +
        `        Add these exact lines to ${IGNORE_FILE}, in this order, after the docs/* line:\n` +
        missing.map((l) => `          ${l}`).join('\n'),
    )
  }
}

// ---------------------------------------------------------------------------
// 4. Report. Both halves print what they judged, so neither can rot unexamined.
// ---------------------------------------------------------------------------
console.log(`${TAG} REQUIRED reads, each re-included in ${IGNORE_FILE}:`)
for (const [path, reason] of Object.entries(REQUIRED_READS)) {
  const v = judgeIgnored(path.endsWith('/') ? `${path}probe` : path)
  console.log(`${TAG}   ${v.ignored ? 'EXCLUDED ' : 'included '} ${path}`)
  console.log(`${TAG}       ${reason}`)
}
const executed = entriesThatReadThroughTheIgnore(ROOT, topLevels)
console.log(
  `${TAG} every OTHER docs/ read is proved by EXECUTION, not by a review record: ${executed.length} prebuild entry point(s) are run inside a materialised upload by excluded-reads-survive-the-upload.mjs.`,
)
for (const { entry, because } of executed) console.log(`${TAG}   ${entry}  (${because})`)

declareWork('vercelignore-covers-guard-reads', {
  did: {
    'ignore rule read': rules.length,
    'registry entry judged': Object.keys(REQUIRED_READS).length,
    'build-time script scanned': scanned.length,
    'literal judged under an excluded top level': literals.length,
  },
  found: { 'exclusion fault': faults.length },
})

if (faults.length > 0) {
  console.error(`${TAG} ${faults.length} fault(s). A guard that reads a file Vercel never uploads blocks every deployment while passing locally; fix the exclusion before the push.`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${Object.keys(REQUIRED_READS).length} required read(s) survive ${IGNORE_FILE}; ${literals.length} literal(s) under an excluded top level (${[...topLevels].join(', ')}) across ${scanned.length} build-time script(s), every one either required or executed in the upload.`,
)
