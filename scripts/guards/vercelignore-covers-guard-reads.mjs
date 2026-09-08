/**
 * ANYTHING A BUILD-TIME GUARD READS UNDER docs/ MUST SURVIVE .vercelignore
 * (close-out C18 FINAL, 7 September 2026, written after the third occurrence).
 *
 * .vercelignore excludes docs/* so the deployment upload stays small, and its own
 * header records two deployments broken the same way: a script in the prebuild
 * chain read a file under docs/, passed locally where the file exists, and blocked
 * every Vercel build where it does not (docs/PRICING.md on the pricing lock, then
 * docs/security/CREDENTIAL-ROTATION.md). On 7 September 2026 it happened a third
 * time: community-layer-protected.mjs read docs/scope/community-layer-approved.json,
 * the local gate was green, and the preview build of PR 136 died with ENOENT at
 * /vercel/path0/docs/scope/community-layer-approved.json. The header's own rule,
 * "anything a build-time guard reads must be listed here as an exception", was a
 * sentence. This guard makes it a gate, and it runs in the same prebuild chain, so
 * the fault is caught on the local gate before Vercel ever sees the commit.
 *
 * What it judges:
 *   1. REQUIRED. Every path in REQUIRED_READS is a docs/ file a prebuild script
 *      reads and cannot do without. Each must exist, must be named by at least one
 *      build-time script (so the registry cannot rot), and must NOT be ignored by
 *      .vercelignore under the gitignore semantics Vercel inherits, including the
 *      rule that a file inside an excluded DIRECTORY can never be re-included,
 *      which is why each level is walked down (!docs/scope/, docs/scope/*,
 *      !docs/scope/the-file).
 *   2. LITERALS. Every 'docs/...' string literal in a build-time script (the
 *      prebuild chain: scripts/check-*.mjs, scripts/prebuild-fixture.mjs,
 *      scripts/guards/*.mjs, scripts/guards/lib/*.mjs, src/lib/health/*.mjs) is
 *      either a REQUIRED read or sits in a file reviewed as TOLERANT, a scanner
 *      that walks docs/ when it is present and is correct when it is not. An
 *      unlisted literal fails, because the next ENOENT on Vercel starts exactly
 *      there.
 *   3. The evaluator REFUSES a .vercelignore pattern it does not understand
 *      (globstar, character classes, a wildcard anywhere but a final slash-star)
 *      rather than guessing what Vercel would do with it.
 *
 * Both reviewed lists are printed on every run so neither can rot quietly.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs: the record's
 * re-inclusion removed from .vercelignore, and a guard made to name a docs/ path
 * nobody re-included.
 *
 * Run: node scripts/guards/vercelignore-covers-guard-reads.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { makeJudgeIgnored, parseVercelIgnore } from './lib/vercelignore.mjs'
import { REQUIRED_READS, TOLERANT_FILES } from './lib/vercelignore-registry.mjs'

const ROOT = process.cwd()
const TAG = '[vercelignore-covers-guard-reads]'
const IGNORE_FILE = '.vercelignore'

/*
 * REQUIRED_READS and TOLERANT_FILES now live in ./lib/vercelignore-registry.mjs,
 * because tolerant-guards-survive-the-upload.mjs executes the tolerant half and
 * two copies of one list is how the two guards would come to disagree.
 */
const SCAN_DIRS = ['scripts/guards', 'scripts/guards/lib', 'src/lib/health']
const SCAN_FILES = ['scripts/prebuild-fixture.mjs']

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
// 2. Scan the build-time scripts for docs/ literals.
// ---------------------------------------------------------------------------
const scanned = []
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) continue
  for (const name of readdirSync(abs)) {
    if (name.endsWith('.mjs')) scanned.push(`${dir}/${name}`)
  }
}
const scriptsDir = join(ROOT, 'scripts')
for (const name of readdirSync(scriptsDir)) {
  if (name.startsWith('check-') && name.endsWith('.mjs')) scanned.push(`scripts/${name}`)
}
for (const f of SCAN_FILES) if (existsSync(join(ROOT, f))) scanned.push(f)

const LITERAL = /['"`](docs\/[A-Za-z0-9_.\/-]+)['"`]/g
/** @type {Array<{ file: string, literal: string, line: number }>} */
const literals = []
for (const file of scanned) {
  if (file === 'scripts/guards/vercelignore-covers-guard-reads.mjs') continue // this guard names its own subject matter
  const text = readFileSync(join(ROOT, file), 'utf8')
  const lines = text.split('\n')
  lines.forEach((lineText, i) => {
    for (const m of lineText.matchAll(LITERAL)) literals.push({ file, literal: m[1], line: i + 1 })
  })
}

const namedBy = new Map()
for (const { file, literal } of literals) {
  if (!namedBy.has(literal)) namedBy.set(literal, new Set())
  namedBy.get(literal).add(file)
}

// ---------------------------------------------------------------------------
// 3. Judge.
// ---------------------------------------------------------------------------
for (const [path, reason] of Object.entries(REQUIRED_READS)) {
  if (!existsSync(join(ROOT, path))) fail(`the REQUIRED read ${path} does not exist in the tree (${reason})`)
  if (!namedBy.has(path)) fail(`the REQUIRED read ${path} is named by no build-time script; the registry entry has rotted (${reason})`)
  const verdict = judgeIgnored(path)
  if (verdict.ignored) {
    fail(`${path} is EXCLUDED by ${IGNORE_FILE} (${verdict.by}); every Vercel build will die with ENOENT on it. Re-include it level by level: !dir/, dir/*, !dir/file`)
  }
}

for (const { file, literal, line } of literals) {
  if (Object.hasOwn(REQUIRED_READS, literal)) continue
  if (Object.hasOwn(TOLERANT_FILES, file)) continue
  fail(`${literal} is read by ${file}:${line} but is neither a REQUIRED read nor in a file reviewed as tolerant; add it to REQUIRED_READS in this guard and re-include it in ${IGNORE_FILE} level by level, or review the file as tolerant with the reason`)
}

for (const file of Object.keys(TOLERANT_FILES)) {
  if (!scanned.includes(file)) fail(`the TOLERANT entry ${file} matches no build-time script; remove the rotted entry`)
}

console.log(`${TAG} REQUIRED reads, each re-included in ${IGNORE_FILE} (reviewed, printed so it cannot rot):`)
for (const [path, reason] of Object.entries(REQUIRED_READS)) {
  const v = judgeIgnored(path)
  console.log(`${TAG}   ${v.ignored ? 'EXCLUDED ' : 'included '} ${path}`)
  console.log(`${TAG}       ${reason}`)
}
console.log(`${TAG} TOLERANT build-time scripts (reviewed, and EXECUTED in a materialised upload by tolerant-guards-survive-the-upload.mjs):`)
for (const [file, reason] of Object.entries(TOLERANT_FILES)) {
  console.log(`${TAG}   ${file}`)
  console.log(`${TAG}       ${reason}`)
}

declareWork('vercelignore-covers-guard-reads', {
  did: {
    'ignore rule read': rules.length,
    'registry entry judged': Object.keys(REQUIRED_READS).length,
    'build-time script scanned': scanned.length,
    'docs literal judged': literals.length,
  },
  found: { 'exclusion fault': faults.length },
})

if (faults.length > 0) {
  console.error(`${TAG} ${faults.length} fault(s). A guard that reads a file Vercel never uploads blocks every deployment while passing locally; fix the exclusion before the push.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${Object.keys(REQUIRED_READS).length} required docs/ reads survive ${IGNORE_FILE}; ${literals.length} docs/ literal(s) across ${scanned.length} build-time script(s) are required or reviewed.`)
