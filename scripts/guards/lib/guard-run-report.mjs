/**
 * WHAT THE GUARD RUNNER SAYS WHEN A GUARD FAILS.
 *
 * Close-out F1.1, written after two full log reads across three passes were
 * spent on a question the gate should have answered in one line. On 9 September
 * 2026 CI run 34290357211 and Vercel preview p3ls50uhh both ended with the same
 * sentence and nothing else:
 *
 *     [guards] 1 of 84 guard(s) FAILED. Build blocked.
 *
 * Eighty-four guards print eighty-four PASS blocks above that line, so the one
 * that failed is somewhere in several thousand lines of output that a CI web
 * view truncates and a Vercel build log paginates. The runner knew the answer
 * and threw it away: it counted failures into an integer instead of keeping the
 * names it already had in its hand.
 *
 * This module holds the two halves of that answer so they can be driven by a
 * test rather than read out of a build once and believed:
 *
 *   describeOutcome  turns a spawnSync result into a verdict, distinguishing a
 *                    guard that exited non-zero from one killed by a signal and
 *                    from one that could not be spawned at all. Those are three
 *                    different faults and reading them as one is how "the guard
 *                    failed" gets confused with "the guard is not there".
 *   renderFailures   turns the collected failures into the lines the runner
 *                    prints last, so the final thing on the screen names every
 *                    guard that failed and how it failed.
 *
 * Driven in tests/unit/guards/guard-run-report.test.ts against real child
 * processes, and drilled end to end in scripts/verify/guard-failure-drills.mjs,
 * which makes a real registered guard fail and reads its name back out of the
 * runner's output.
 */

/** @typedef {{ ok: true } | { ok: false, reason: string }} Outcome */

/**
 * Judge one guard's spawnSync result.
 *
 * @param {{ status: number | null, signal: string | null, error?: Error }} result
 * @returns {Outcome}
 */
export function describeOutcome(result) {
  if (result.error) return { ok: false, reason: `could not be started: ${result.error.message}` }
  if (result.signal) return { ok: false, reason: `killed by signal ${result.signal}` }
  if (result.status === null) return { ok: false, reason: 'ended with no exit status' }
  if (result.status !== 0) return { ok: false, reason: `exit ${result.status}` }
  return { ok: true }
}

/**
 * The lines the runner prints when at least one guard failed. The LAST line
 * names them, because a build log is read from the bottom.
 *
 * @param {{ failures: Array<{ guard: string, reason: string }>, total: number, runtime: string }} input
 * @returns {string[]}
 */
export function renderFailures({ failures, total, runtime }) {
  const lines = [
    '',
    `[guards] ${failures.length} of ${total} guard(s) FAILED. Build blocked.`,
    `[guards] runtime: ${runtime}`,
    '',
    '[guards] the guard(s) that failed, in the order they ran:',
  ]
  for (const f of failures) lines.push(`[guards]   ${f.guard}  (${f.reason})`)
  lines.push('')
  lines.push(
    `[guards] re-run one of them on its own to read what it caught:  node ${failures[0].guard}`,
  )
  lines.push(`[guards] FAILED: ${failures.map((f) => f.guard).join(', ')}`)
  return lines
}
