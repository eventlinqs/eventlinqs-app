/**
 * DID VITEST FAIL TO START A WORKER, AND FOR WHICH FILES?
 *
 * ============================================================================
 * WHY THIS MATTERS ENOUGH TO BE ITS OWN TESTED MODULE
 * ============================================================================
 *
 * A vitest worker that never starts takes its files with it, and the files it
 * takes register NOTHING. In the JSON report that is indistinguishable from a
 * file somebody deleted, so the test-count canary reported it as "the suite is
 * running LESS than it used to" and sent the reader hunting through the tree.
 * Measured on 18 September 2026, three times in one afternoon, once costing
 * eleven files and 75 tests:
 *
 *     Error: [vitest-pool]: Failed to start forks worker for test files
 *       C:/dev/EventLinqs/eventlinqs-app/tests/unit/maps/auth-failure-hook.test.ts.
 *     Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
 *      Test Files  441 passed (441)
 *
 * 441 of 442, nothing failed, and the suite called itself green. The evidence is
 * only ever on stderr, so it has to be read from there.
 *
 * ============================================================================
 * AND WHY IT IS TESTED RATHER THAN TRUSTED
 * ============================================================================
 *
 * Because the first version of this matcher was BLIND, which is the third blind
 * matcher found in this tree in two days. It read:
 *
 *     /Failed to start \w+ worker for test files ([^\n.]+\.tsx?)/
 *
 * `[^\n.]` cannot cross a dot, and every test file on this platform has two of
 * them (`.test.ts`). Run against the real captured output above it returned an
 * empty array, so the canary would have gone on blaming the tree with the
 * answer sitting in a string it already held.
 *
 * `tests/unit/perf/vitest-pool-start-failures.test.ts` holds it against that
 * exact captured text.
 */

/**
 * Every test file named in a vitest pool start failure, from combined
 * stdout/stderr. Empty when the run had none.
 *
 * The path is taken to the end of the line rather than by matching an
 * extension: vitest prints an absolute path and may list several files, and a
 * pattern that tries to be clever about the shape of a filename is what went
 * blind the first time. The trailing full stop vitest ends the sentence with is
 * removed, and nothing else is interpreted.
 */
export function poolStartFailures(output) {
  return [...String(output ?? '').matchAll(/Failed to start \S+ worker for test files ([^\n\r]+)/g)]
    .map(m => m[1].trim().replace(/\.$/, ''))
    .flatMap(list => list.split(',').map(f => f.trim()))
    .filter(Boolean)
}
