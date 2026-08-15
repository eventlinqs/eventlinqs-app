/**
 * THE CANARY: the suite may not quietly run fewer tests than it used to.
 *
 * WHY THIS IS THE LAYER THAT ACTUALLY CLOSES THE CLASS. Twice in two days a test
 * file reported healthy while running nothing:
 *
 *   1. A shebang on a module a test imported made the file fail to parse, so
 *      tests/unit/security/rls-column-exposure.test.ts collected ZERO tests for
 *      the entire life of the branch. Seventeen assertions about who can read a
 *      sensitive column were simply not running, and the guard for that class was
 *      therefore not running either.
 *   2. A file vanishing mid-walk threw at module scope, so
 *      tests/unit/dashboard/no-clock-during-render.test.ts collected zero and its
 *      twenty four tests silently did not run.
 *
 * Different causes, identical signature: vitest reports a collection failure as
 * "no tests", the file count still looks plausible, and a human reading
 * "2251 passed" has no way to know that yesterday it was 2251 and today it is
 * 2227. Guarding the known walkers fixes the two instances. It does not stop a
 * third cause, and there will be a third cause.
 *
 * So this does not care WHY the count dropped. It cares that it dropped.
 *
 * WHAT VITEST ALREADY DOES, stated honestly so this guard is not credited with
 * more than it earns. A file that fails to COLLECT is reported by vitest as a
 * failed suite and the run exits non-zero, so with the pre-push hook in place
 * that particular path is already blocked. Both incidents above got through for a
 * different reason: in the first, nobody ran the suite at all; in the second, the
 * run did go red and the reduced count was not the thing anyone looked at.
 *
 * The hole this closes that NOTHING else does is the quieter one: a file that
 * collects perfectly well and simply registers FEWER tests than it used to. An
 * `it` commented out, a `describe` left empty by a bad merge, a conditional skip
 * that starts always skipping. Every one of those is green, exits zero, and runs
 * less than yesterday.
 *
 * THE NUMBERS BELOW ONLY EVER RISE. That is the whole discipline. If a test is
 * legitimately deleted, the founder rules on it and the baseline moves down with
 * a note saying who decided and why. Lowering it to make a red build green is the
 * exact move this file exists to prevent, so it is spelled out rather than left
 * to judgement.
 *
 * Run standalone:  node scripts/guards/test-count-canary.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * THE COMMITTED BASELINE. Raise it when the suite grows. Never lower it without
 * a founder ruling recorded on the line below.
 *
 * 2026-08-14: 185 files / 2251 tests, measured on Node 24.19.0 after the
 * rls-column-exposure file was restored (it had been collecting zero) and after
 * the vanish race was guarded. Both of those RAISED the count, which is the
 * point: the previous green run of 2227 was green while running less.
 *
 * 2026-08-14 (later, same day): 186 files / 2254 tests. Two changes, both
 * upward. `tests/unit/guards/guard-registry.test.ts` had `every registered guard
 * exists on disk` restored from `test.skip` to `test`, which this guard caught
 * and which put back 1 test. `tests/unit/security/githooks-executable.test.ts`
 * is new and adds 3, asserting the hooks are mode 100755 in the git index after
 * both were found committed as 100644, a state in which a POSIX checkout runs
 * NEITHER of them and says nothing.
 *
 * 2026-08-15: 187 files / 2260 tests. Six added: two in fixture-integrity
 * asserting the homepage density fixture is not stale, and four in the new
 * fixture-fallthrough file pinning that a stale fixture falls through to the
 * live query instead of blanking the homepage. That defect had the deployed
 * preview serving an empty homepage over a database holding 184 upcoming events.
 *
 * 2026-08-15 (third): 189 files / 2275 tests. Added the seat-map cross-tenant
 * pins (a genuine IDOR: saveSeatMap wrote sections into another organisation's
 * chart because a zero-row update is not an error) and widened the sale-gate
 * cases to the five fields the charge precondition actually requires.
 *
 * 2026-08-15 (fourth): 190 files / 2284 tests. The sales-attribution
 * reconciliation: nine cases pinning that the three buckets sum to the order
 * ledger exactly, that an order carrying two conversion rows is counted once,
 * and that one exported SOLD_STATUSES decides what a sale is (three different
 * definitions were live at the same time).
 *
 * 2026-08-15 (later): 188 files / 2265 tests. Five added in the new
 * tests/unit/events/sale-gate-source.test.ts, pinning the defect where a
 * security fix silently turned off ticket sales on every paid event: the anon
 * embed lost the two Stripe columns the sale gate reads, so saleBlocked was true
 * platform-wide.
 */
/*
 * 2026-08-15: raised 2300 -> 2305. Five tests added by the ONE FEE pass, all in
 * tests/unit/ai-layer.test.ts: every assistant carries the live fee label, every
 * assistant refuses to quote a figure when the live lookup fails, no assistant
 * ASSERTS a second fee or carries a deleted figure, and two on the knowledge
 * base rendering with and without a live fee. The canary asked for the floor to
 * be raised on the push that introduced them, which is the point of it: a floor
 * that is not raised stops being a floor.
 */
/*
 * 2026-08-15: raised 191/2305 -> 192/2331. External ticketing support: a new
 * file (tests/unit/payments/external-ticketing.test.ts, 23 tests pinning the
 * five non-negotiables and the destination validator) plus three added to
 * sales-attribution for the exclusion of external events from the sold-ticket
 * buckets.
 */
const MIN_FILES = 192
const MIN_TESTS = 2331

/**
 * SKIPPED TESTS ALLOWED: NONE. This closes a hole in the two counts above.
 *
 * The counts are a FLOOR, so they catch a test that disappears. They do not
 * catch a test that disappears while another one arrives, because the total is
 * unchanged. Adding one test and skipping one test nets to zero, and a skipped
 * test is a test that is not running.
 *
 * That is not hypothetical. This guard caught exactly it on 14 August 2026:
 * `tests/unit/guards/guard-registry.test.ts` had `every registered guard exists
 * on disk` changed from `test(` to `test.skip(` with no comment and no reason.
 * That is the check which catches a guard being registered in the runner while
 * its file is absent, so disabling it disables the thing that notices a guard
 * protecting nothing. Un-skipped, it passes, so the skip was hiding nothing and
 * had simply been left behind.
 *
 * A legitimate skip is therefore a founder decision recorded here, exactly like
 * lowering the counts. Raising this to 1 to make a push go green is the move
 * this constant exists to stop.
 */
const MAX_SKIPPED = 0

/*
 * Written to a file, and to a REPOSITORY-RELATIVE one.
 *
 * Two things were learned the hard way here. `--outputFile=-` does not stream to
 * stdout in vitest 4, and an ABSOLUTE path into the system temp directory is not
 * honoured either: vitest resolves the option against the project root and the
 * file simply never appears, which this guard then reports as "vitest wrote no
 * report". A dotfile in the repo root works, and is removed in `finally` so a
 * crashed run cannot leave it behind for git to notice.
 */
// NOT a dotfile: a leading dot in --outputFile produced no report at all, with
// no error, which is its own small lesson about trusting a silent success.
const REPORT_NAME = `test-count-canary-${process.pid}.json`
const REPORT = join(ROOT, REPORT_NAME)

/*
 * vitest is invoked through its own JS entry point rather than through npx.
 *
 * `spawnSync('npx.cmd', ...)` on Windows under Node 24 fails SILENTLY: both
 * stdout and stderr come back empty and the exit status tells you nothing,
 * because Node now refuses to spawn a .cmd without an explicit shell. The first
 * symptom was this guard reporting "vitest wrote no report", which points at the
 * reporter and not at the spawn. Calling node on vitest.mjs needs no shell, so
 * there is nothing to get wrong and nothing to quote.
 */
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(
  process.execPath,
  [VITEST, 'run', '--reporter=json', `--outputFile=${REPORT_NAME}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)

if (!existsSync(REPORT)) {
  console.error(`[test-count-canary] vitest wrote no JSON report at ${REPORT_NAME}, so nothing can be counted.`)
  console.error('--- vitest stdout (tail) ---')
  console.error((result.stdout ?? '').slice(-1500))
  console.error('--- vitest stderr (tail) ---')
  console.error((result.stderr ?? '').slice(-1500))
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'))
} catch (err) {
  console.error(`[test-count-canary] the vitest report was not parseable JSON: ${err.message}`)
  process.exit(1)
} finally {
  rmSync(REPORT, { force: true })
}

/*
 * PASSED, not TOTAL. Found by drilling this guard rather than by reasoning about
 * it: `numTotalTests` COUNTS SKIPPED TESTS, so adding `.skip` to a test left the
 * total at 2251 and this canary said PASS while one fewer assertion ran. That is
 * the identical failure mode the canary exists to catch, reproduced inside the
 * canary itself. Counting what actually executed and passed closes it, and also
 * catches a test quietly turned into a skip during a merge.
 */
const files = Array.isArray(report.testResults) ? report.testResults.length : report.numTotalTestSuites
const tests = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0

/*
 * `numFailedTests` IS ZERO WHEN A FILE FAILS TO COLLECT, and reading that number
 * alone is how a broken file reads as a clean run.
 *
 * Established from the installed vitest 4.1.5 source rather than assumed.
 * @vitest/runner catches a module-evaluation throw and records it on the FILE
 * (`file.result = { state: 'fail', errors }`), and the JSON reporter computes
 * `numFailedTests` as `tests.filter(t => t.result?.state === 'fail').length`. A
 * file that never collected registered no tests, so it contributes no failing
 * TASK and `numFailedTests` stays 0.
 *
 * This guard reproduced exactly that on 14 August 2026: a deliberate module-scope
 * throw printed `185 files, 2246 tests, 0 failed`. Five tests had stopped running
 * and the failure count said everything was fine. Only the count floor caught it,
 * which means a run that happened to add five tests elsewhere would have hidden it
 * completely.
 *
 * The fields that DO see it are `success`, `numFailedTestSuites`, and a
 * testResults entry whose status is failed. All three are checked.
 */
const failedSuites = report.numFailedTestSuites ?? 0
const reportedSuccess = report.success === true
/** A file that failed while registering no tests at all: a collection failure. */
const collectionFailures = (Array.isArray(report.testResults) ? report.testResults : [])
  .filter(r => r.status === 'failed' && (r.assertionResults ?? []).length === 0)
  // Both sides normalised to forward slashes before stripping: ROOT is a Windows
  // path with backslashes and vitest reports forward slashes, so a raw replace
  // silently matches nothing and prints the absolute path.
  .map(r => (r.name ?? '').replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''))
const skipped = report.numPendingTests ?? 0
if (skipped > 0) console.log(`[test-count-canary] ${skipped} test(s) skipped, which do not count as run`)

console.log(`[test-count-canary] ${files} files, ${tests} tests, ${failed} failed, ${skipped} skipped`)
console.log(`[test-count-canary] baseline ${MIN_FILES} files, ${MIN_TESTS} tests, ${MAX_SKIPPED} skipped`)

const problems = []
if (collectionFailures.length > 0) {
  problems.push(
    `${collectionFailures.length} FILE(S) FAILED TO COLLECT, registering zero tests:\n` +
      collectionFailures.map(f => `        ${f}`).join('\n') + '\n' +
      '      This is the silent shape. The file threw at module scope, so it has no\n' +
      '      failing test to count and numFailedTests reads 0. Every test it holds\n' +
      '      simply did not run.',
  )
}
if (failedSuites > 0 && collectionFailures.length === 0) {
  problems.push(`${failedSuites} test SUITE(S) failed. Read the vitest output.`)
}
if (!reportedSuccess) {
  problems.push('vitest reported success=false for this run.')
}
if (failed > 0) {
  problems.push(`${failed} test(s) FAILED. This runs the suite, so it reports failures too.`)
}
if (files < MIN_FILES) {
  problems.push(
    `only ${files} test FILES ran, baseline is ${MIN_FILES}.\n` +
      '      A file that fails to COLLECT is reported by vitest as "no tests", not as a\n' +
      '      failure, so this is very often a file that crashed at module scope rather\n' +
      '      than a file somebody deleted.',
  )
}
if (tests < MIN_TESTS) {
  problems.push(
    `only ${tests} TESTS ran, baseline is ${MIN_TESTS}.\n` +
      '      Tests that do not run cannot fail, so a green suite that runs fewer tests\n' +
      '      is not evidence of anything.',
  )
}
if (skipped > MAX_SKIPPED) {
  problems.push(
    `${skipped} test(s) SKIPPED, the allowance is ${MAX_SKIPPED}.\n` +
      '      A skipped test is a test that is not running. This is checked separately\n' +
      '      from the counts above because adding one test while skipping another\n' +
      "      leaves the total unchanged, so the floor alone would not notice.\n" +
      '      Find the `.skip` and either remove it or get it ruled on.',
  )
}

if (problems.length > 0) {
  console.error('\n[test-count-canary] FAILED. The suite is running LESS than it used to.\n')
  for (const p of problems) console.error(`  - ${p}\n`)
  console.error(
    '  Find the file that stopped collecting before touching the baseline. Run\n' +
      '  `npx vitest run` and look for a file reporting "no tests" or a suite-level\n' +
      '  error rather than a test-level one.\n\n' +
      '  Lowering MIN_FILES or MIN_TESTS to go green is the move this guard exists to\n' +
      '  stop. It needs a founder ruling and a note on the constant.\n',
  )
  process.exit(1)
}

if (files > MIN_FILES || tests > MIN_TESTS) {
  console.log(
    `[test-count-canary] the suite has GROWN (${files}/${tests} against ${MIN_FILES}/${MIN_TESTS}).\n` +
      '[test-count-canary] raise the baseline in this file so the new floor is held.',
  )
}

console.log('[test-count-canary] PASS - nothing stopped running.')
