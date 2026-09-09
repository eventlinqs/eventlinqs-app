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
 *
 * CLOSE-OUT F2.3, AND A CORRECTION TO ITS PREMISE, RECORDED BECAUSE THE PREMISE
 * IS WHAT THE FIX WOULD OTHERWISE BE BUILT ON.
 *
 * F2.3 reads: "On Vercel, where the guard THREW, the name was lost: [guards]
 * FAILED:". It was not lost. The Vercel build log wraps at about 72 columns and
 * the name is on the continuation line. The raw log of that deployment, kept at
 * C:\dev\vercel-fail2.txt, lines 2144 to 2151:
 *
 *     [guards] the guard(s) that failed, in the order
 *     they ran:
 *     [guards]
 *     scripts/guards/excluded-reads-survive-the-upload.mjs  (exit 1)
 *     ...
 *     [guards] FAILED:
 *     scripts/guards/excluded-reads-survive-the-upload.mjs
 *
 * So F1.1 held on the build host. Saying otherwise here would have been a fix
 * built on a defect that did not exist.
 *
 * WHAT WAS GENUINELY MISSING IS THE REST OF F2.3'S SENTENCE, and it is the half
 * that matters: "attributed to the guard that raised it, and printed with its
 * message and the first line of its stack". A guard that THREW and a guard that
 * printed a considered FAIL and exited 1 were reported identically, as `exit 1`.
 * Those are different faults. One means the law was broken; the other means the
 * guard broke, and on the build host that is nearly always an environment the
 * author never ran on. Reading several thousand lines upward to tell them apart
 * is the same cost F1.1 was written to remove, one layer in.
 *
 * A throw is recognised by its STACK FRAMES, said plainly because it is a
 * heuristic rather than a fact the operating system reports: an uncaught
 * exception in Node prints `    at ...` frames to stderr and exits 1, and a
 * guard reporting an ordinary violation does not. `process.exit(1)` after a
 * printed FAIL therefore reads as `exit 1`, and an uncaught throw reads as
 * `threw`, with its message and first frame on the summary line.
 */

/** @typedef {{ message: string, frame: string | null }} Thrown */
/** @typedef {{ ok: true } | { ok: false, reason: string, thrown?: Thrown }} Outcome */

/**
 * The uncaught exception in a guard's stderr, if that is what killed it.
 *
 * A STACK FRAME IS THE SIGNAL, and it is a heuristic rather than something the
 * operating system tells us. Node prints `    at <frame>` lines for an uncaught
 * exception and a guard reporting an ordinary violation does not, so a run
 * ending non-zero with frames on stderr threw, and one without them decided.
 * The distinction is worth a heuristic because the two demand opposite
 * responses: a considered FAIL means fix the code it caught, and a throw means
 * fix the guard, which on the build host almost always means the guard was
 * never run there.
 *
 * The message is the last non-empty line ABOVE the first frame. Node prints the
 * offending source line and a caret above the error line, so taking the first
 * non-empty line would report a fragment of the guard's own source instead.
 *
 * @param {string} stderr
 * @returns {Thrown | null}
 */
export function thrownFrom(stderr) {
  if (!stderr) return null
  const lines = stderr.split(/\r?\n/)
  const frameAt = lines.findIndex((l) => /^\s+at\s+\S/.test(l))
  if (frameAt === -1) return null
  const above = lines.slice(0, frameAt).filter((l) => l.trim() !== '')
  /*
   * THE `Error: text` LINE, and the name prefix is OPTIONAL, which the first
   * version of this regex got wrong and a test caught. It required a prefix
   * (`TypeError`, `RangeError`), so a bare `Error:` never matched and the
   * fallback below reported the line under it instead. The real shape from
   * the deployment this exists for, driven in the test file:
   *
   *     fatal: not a git repository (or any of the parent directories): .git
   *     node:internal/errors:985
   *       const err = new Error(message);
   *                   ^
   *     Error: Command failed: git ls-files -z          <- this line
   *     fatal: not a git repository ...                 <- was reported instead
   *         at genericNodeError (node:internal/errors:985:15)
   *
   * The FIRST match is taken, not the last: Node prints the top-level error
   * first and any `[cause]` beneath it, and the top-level one is the fault.
   * The last non-empty line stays as the fallback for a process that died
   * with frames but no recognisable error line.
   */
  const named = above.find((l) => /^(?:[A-Za-z_$][\w$]*)?(?:Error|Exception)(?::|\s|$)/.test(l.trim()))
  const message = (named ?? above[above.length - 1] ?? '(no message)').trim()
  return { message, frame: lines[frameAt].trim() }
}

/**
 * Judge one guard's spawnSync result.
 *
 * `stderr` is optional so a caller that inherits the child's streams still gets
 * the exit-status verdict; without it a throw is indistinguishable from a
 * decision, which is the state this function was in before close-out F2.3.
 *
 * @param {{ status: number | null, signal: string | null, error?: Error, stderr?: string | Buffer | null }} result
 * @returns {Outcome}
 */
export function describeOutcome(result) {
  if (result.error) return { ok: false, reason: `could not be started: ${result.error.message}` }
  if (result.signal) return { ok: false, reason: `killed by signal ${result.signal}` }
  if (result.status === null) return { ok: false, reason: 'ended with no exit status' }
  if (result.status === 0) return { ok: true }
  const thrown = thrownFrom(typeof result.stderr === 'string' ? result.stderr : (result.stderr?.toString() ?? ''))
  if (thrown) return { ok: false, reason: `threw, exit ${result.status}`, thrown }
  return { ok: false, reason: `exit ${result.status}` }
}

/**
 * The lines the runner prints when at least one guard failed. The LAST line
 * names them, because a build log is read from the bottom.
 *
 * @param {{ failures: Array<{ guard: string, reason: string, thrown?: Thrown }>, total: number, runtime: string }} input
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
  for (const f of failures) {
    lines.push(`[guards]   ${f.guard}  (${f.reason})`)
    // ATTRIBUTED TO THE GUARD THAT RAISED IT, indented under its name, so the
    // exception and the file it came out of are one thing to read rather than
    // two thousand lines apart (close-out F2.3).
    if (f.thrown) {
      lines.push(`[guards]       it threw: ${f.thrown.message}`)
      if (f.thrown.frame) lines.push(`[guards]       first frame: ${f.thrown.frame}`)
      lines.push(
        `[guards]       a guard that THREW is a broken guard, not a caught violation. On the build host that`,
      )
      lines.push(
        `[guards]       usually means it was never run there: no docs, no git, no token (close-out F2.1).`,
      )
    }
  }
  lines.push('')
  lines.push(
    `[guards] re-run one of them on its own to read what it caught:  node ${failures[0].guard}`,
  )
  lines.push(`[guards] FAILED: ${failures.map((f) => f.guard).join(', ')}`)
  return lines
}
