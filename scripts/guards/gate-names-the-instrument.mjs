/**
 * GUARD: a Lighthouse score is never reported without the machine it was taken on.
 *
 * WHY THIS EXISTS, and it is the most expensive thing this repository has
 * learned about its own gate.
 *
 * On 8 September 2026 the local gate refused main's own tree against floors that
 * same tree had cleared three times the same afternoon. Script bytes were
 * identical to the byte; Total Blocking Time had roughly doubled on every URL.
 * With no machine reading anywhere in the output, the only two readings
 * available were "the product regressed" and "the floors are wrong", and a
 * session was spent on the second: the owner was asked to choose between
 * lowering a floor written that morning and deleting a piece of the product.
 *
 * Re-measured on 9 September on the same tree, every URL cleared every floor,
 * on a locally served build AND on the Vercel preview. The only thing that had
 * changed was the laptop: BenchmarkIndex 2665 to 2755 against 1113 to 1993.
 * Evidence: C:\dev\EVIDENCE\P0.7-D.
 *
 * The defect was never in the floors or in the pages. It was that the gate could
 * not tell a slow machine from a slow product, so it reported one as the other.
 *
 * WHAT THIS GUARD HOLDS. Three call sites, and each one is a single line
 * somebody could delete in a tidy-up without noticing what it cost to add:
 *
 *   1. scripts/ci/lighthouse-truth-table.mjs READS environment.benchmarkIndex
 *      out of every report, so the number reaches the table at all.
 *   2. The same file PRINTS it, through machineLine(), on every collection.
 *   3. scripts/ops/pre-push-gate.mjs consults scripts/ci/lighthouse-calibration.mjs
 *      on a FAILED assertion, so a red step says which of the two causes it was.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not check that the diagnosis is
 * right, and it cannot: that is what the unit test drills, in both directions.
 * It checks that the diagnosis still HAPPENS, which is the thing a refactor
 * silently removes.
 *
 * AND IT REFUSES TO BE SATISFIED BY A WAIVER. The calibration module must return
 * the assertion result untouched. If a future edit made a degraded machine
 * EXCUSE a failure, this guard fails: that would be a waiver, and close-out P0,
 * P0.7, H5 and C16.5 each forbid one in their own words.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { machineLine, summarise } from '../ci/lighthouse-truth-table.mjs'
import { stripComments } from '../lib/js-source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const FILES = {
  table: 'scripts/ci/lighthouse-truth-table.mjs',
  calibration: 'scripts/ci/lighthouse-calibration.mjs',
  gate: 'scripts/ops/pre-push-gate.mjs',
}

/**
 * Read a source file with its line endings normalised to LF.
 *
 * NOT cosmetic. This repository's working tree is CRLF on Windows, and the first
 * run of this guard reported a real rule as broken because `\n\s*return asserted`
 * cannot match `\r\n    return asserted`. A guard that fails on a line ending is
 * a guard somebody switches off.
 */
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').split('\r\n').join('\n')

/**
 * EVERY TEXT CHECK BELOW RUNS AGAINST COMMENT-STRIPPED SOURCE, and the first
 * drill of this guard is why. Deleting the line that reads
 * `environment.benchmarkIndex` out of each report left the guard GREEN, because
 * the docstring below it explains what that field is, in prose, and the pattern
 * matched the explanation instead of the code. A guard a comment can satisfy is
 * a guard that passes for the wrong reason exactly when it matters.
 *
 * `stripComments` from scripts/lib/js-source.mjs, not a local regex: it
 * preserves string and template literals, which a naive strip does not, and it
 * exists because two earlier guards each failed on their own post-mortem.
 */
const code = (text) => stripComments(text)

const source = {}
const failures = []
for (const [key, rel] of Object.entries(FILES)) {
  try {
    source[key] = code(read(rel))
  } catch (error) {
    failures.push({ where: rel, what: 'is not on disk', why: String(error.message ?? error) })
    source[key] = ''
  }
}

const checks = []

/**
 * @param {boolean} holds
 * @param {string} where file the rule lives in
 * @param {string} what the rule, in the present tense
 * @param {string} why what it costs when it stops holding
 */
function require_(holds, where, what, why) {
  checks.push(what)
  if (!holds) failures.push({ where, what, why })
}

// 1. The number is read out of the reports. DRIVEN, not pattern-matched: the
//    first version of this check searched the source for the string
//    "environment.benchmarkIndex", and deleting the line that actually reads it
//    left the guard GREEN, because a message four lines below happens to name
//    the same field inside a string literal. So this feeds summarise() a report
//    and reads the answer back.
const probeLhr = {
  requestedUrl: 'https://example.test/probe',
  finalDisplayedUrl: 'https://example.test/probe',
  lighthouseVersion: '0.0.0',
  categories: { performance: { score: 0.9 } },
  audits: {},
  environment: { benchmarkIndex: 1234 },
}
let probeRows = []
try {
  probeRows = summarise([probeLhr])
} catch (error) {
  failures.push({
    where: FILES.table,
    what: 'summarise() threw on a minimal report',
    why: String(error.message ?? error),
  })
}
require_(
  probeRows[0]?.benchmarkIndex === 1234,
  FILES.table,
  'summarise() carries environment.benchmarkIndex through to the row',
  'without it no row can say what machine it was taken on, and a slow afternoon and a real regression are the same row',
)

// 2. It is printed on every collection, not only on failure. Also driven: the
//    line has to contain the number, not merely exist.
require_(
  machineLine(probeRows).includes('1234'),
  FILES.table,
  'machineLine() prints the reading it was given',
  'the reading has to appear in the ordinary output too: comparing today with yesterday needs it on the GREEN runs as well',
)
require_(
  /machineLine\s*\(/.test(source.table.replace(/export function machineLine\s*\(/, '')),
  FILES.table,
  'machineLine() is actually called when the table is rendered',
  'an exported function nobody calls prints nothing; this is the difference between the capability and the output',
)

// 3. A failed assertion in the local gate reaches the calibration judgement.
require_(
  /from '\.\.\/ci\/lighthouse-calibration\.mjs'/.test(source.gate),
  FILES.gate,
  'the pre-push gate imports scripts/ci/lighthouse-calibration.mjs',
  'a red Lighthouse step would go back to naming only one of its two possible causes',
)
require_(
  /calibrationReport\s*\(/.test(source.gate),
  FILES.gate,
  'the pre-push gate calls calibrationReport() on the failure path',
  'importing it and never calling it is the same as not having it',
)

// 4. The calibration carries its own evidence, so the number can be judged
//    rather than trusted. Same contract as the support horizon in
//    scripts/guards/no-deprecated-runtime.mjs.
for (const field of ['derivedAt', 'floor', 'measuredOn', 'evidence']) {
  require_(
    new RegExp(`${field}:`).test(source.calibration),
    FILES.calibration,
    `CALIBRATION declares ${field}`,
    'a calibration reading with no date and no evidence path is a number somebody once believed, and it goes stale silently',
  )
}

// 5. IT MAY NEVER BECOME A WAIVER. The gate returns the assertion result
//    untouched; the calibration only prints.
require_(
  /if \(asserted !== 0\) \{[\s\S]{0,400}?calibrationReport\(/.test(source.gate) && /\n\s*return asserted\n/.test(source.gate),
  FILES.gate,
  'the gate returns the assertion result unchanged after printing the calibration',
  'a degraded machine must never EXCUSE a failed floor: that is a waiver, and P0, P0.7, H5 and C16.5 each forbid one',
)
require_(
  !/state === 'degraded'[\s\S]{0,200}?(return 0|exitCode = 0|asserted = 0)/.test(source.gate),
  FILES.gate,
  'no path turns a degraded machine into a pass',
  'the whole value of this diagnosis is that it costs nothing in strictness; the moment it buys a green push it is a bypass',
)

declareWork('gate-names-the-instrument', {
  did: { 'source file read': Object.keys(FILES).length, 'reporting property checked': checks.length },
  found: { 'missing instrument reading': failures.length },
})

if (failures.length > 0) {
  console.error('[gate-names-the-instrument] FAIL')
  for (const f of failures) {
    console.error(`  ${f.where}: ${f.what}`)
    console.error(`      ${f.why}`)
  }
  console.error('')
  console.error('  A Lighthouse score without the machine beside it cannot distinguish a slow')
  console.error('  page from a busy laptop. Measured cost of not having this: one session spent')
  console.error('  proposing to lower a floor that was never wrong (C:\\dev\\EVIDENCE\\P0.7-D).')
  process.exitCode = 1
} else {
  console.log(
    `[gate-names-the-instrument] PASS - ${checks.length} reporting properties hold: every collection records the machine it was taken on, a red assertion says which of its two causes it was, and the diagnosis can never excuse a failure.`,
  )
}
