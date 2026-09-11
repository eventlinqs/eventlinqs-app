import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describeOutcome, renderFailures, thrownFrom } from '../../../scripts/guards/lib/guard-run-report.mjs'
import { gitEnv } from '../../../scripts/lib/git-env.mjs'

/**
 * THE GATE MUST NAME WHAT IT CAUGHT. Close-out F1.1.
 *
 * On 9 September 2026 the guard runner ended a CI run and a Vercel preview build
 * with the identical sentence "1 of 84 guard(s) FAILED. Build blocked." and never
 * said which guard. Two full log reads across three passes went on recovering a
 * name the runner had held and discarded.
 *
 * These tests drive REAL child processes rather than hand-written spawnSync
 * shapes, because the thing under test is what Node actually hands back for a
 * script that exits non-zero, and a fabricated result object would prove only
 * that the fabrication matches the assertion. The end-to-end half - a real
 * registered guard made to fail, its name read back out of the real runner's
 * output - is drilled in scripts/verify/guard-failure-drills.mjs.
 */

/** Write a throwaway .mjs and run it exactly as the runner runs a guard. */
function runScript(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-run-report-'))
  const file = join(dir, 'subject.mjs')
  writeFileSync(file, body)
  return spawnSync(process.execPath, [file], { encoding: 'utf8' })
}

describe('describeOutcome, against real child processes', () => {
  test('a guard that exits 0 is ok', () => {
    const result = runScript('process.exit(0)\n')
    expect(describeOutcome(result)).toEqual({ ok: true })
  })

  test('a guard that exits non-zero is named with its exit code', () => {
    const result = runScript('process.exit(3)\n')
    expect(describeOutcome(result)).toEqual({ ok: false, reason: 'exit 3' })
  })

  /*
   * CLOSE-OUT F2.3. This test used to assert `exit 1`, which is what a guard
   * that THREW and a guard that printed a considered FAIL both looked like. They
   * are opposite faults: one says the law was broken, the other says the guard
   * is broken, and on the build host the second nearly always means it was
   * written for a machine it was never run on. The runner now captures stderr
   * so the two can be told apart at all.
   */
  test('a guard that throws says so, and carries what it threw', () => {
    const result = runScript('throw new Error("the guard itself is broken")\n')
    const outcome = describeOutcome(result)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.reason).toBe('threw, exit 1')
    expect(outcome.thrown?.message).toBe('Error: the guard itself is broken')
    expect(outcome.thrown?.frame).toMatch(/^at /)
  })

  test('a guard that DECIDES to fail is not reported as a throw, so the two stay two', () => {
    const result = runScript('console.error("[x] FAIL: a real violation")\nprocess.exit(1)\n')
    expect(describeOutcome(result)).toEqual({ ok: false, reason: 'exit 1' })
  })

  /*
   * THE SHAPE THE BUILD HOST ACTUALLY PRODUCES. Close-out F2's log begins
   * "Error: Command failed: git ls-files -z", which is what execFileSync raises
   * when git is absent, and it is the exception that killed the preview build of
   * ffded236. A synthesised Error would prove the assertion matches the
   * fabrication; this runs the real call in a directory that is not a checkout.
   */
  test('the git-absent exception that killed a real deployment is attributed', () => {
    const outside = mkdtempSync(join(tmpdir(), 'not-a-checkout-'))
    /*
     * env: gitEnv() IS LOAD-BEARING HERE, not hygiene. Inside a git hook GIT_DIR
     * is set and an inheriting child ignores cwd when choosing a repository, so
     * this call would succeed against the REAL repository and the test would stop
     * reproducing a throw while still reporting green. The suite is run BY the
     * pre-push hook, which is the one context nobody develops in.
     */
    const result = runScript(
      "import { execFileSync } from 'node:child_process'\n" +
        `execFileSync('git', ['ls-files', '-z'], { cwd: ${JSON.stringify(outside)}, env: ${JSON.stringify(gitEnv())} })\n`,
    )
    const outcome = describeOutcome(result)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.reason).toBe('threw, exit 1')
    expect(outcome.thrown?.message).toContain('git ls-files')
  })

  test('stderr the runner never captured leaves the verdict at the exit code, never a false throw', () => {
    expect(describeOutcome({ status: 1, signal: null })).toEqual({ ok: false, reason: 'exit 1' })
  })

  test('a guard that is not on disk is reported as unstartable, never as "it failed"', () => {
    const result = spawnSync(join(tmpdir(), 'no-such-guard-binary-9f3a'), [], { encoding: 'utf8' })
    const outcome = describeOutcome(result)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.reason).toMatch(/could not be started/)
  })

  test('a guard killed by a signal is distinguished from one that chose to exit', () => {
    // Synthesised deliberately: a signal kill is not reproducible on Windows,
    // and the branch that matters is which of the three faults gets reported.
    expect(describeOutcome({ status: null, signal: 'SIGKILL' })).toEqual({
      ok: false,
      reason: 'killed by signal SIGKILL',
    })
    expect(describeOutcome({ status: null, signal: null })).toEqual({
      ok: false,
      reason: 'ended with no exit status',
    })
  })
})

describe('renderFailures', () => {
  const failures = [
    { guard: 'scripts/guards/curated-categories-exist.mjs', reason: 'exit 1' },
    { guard: 'scripts/guards/schema-ahead-of-code.mjs', reason: 'exit 1' },
  ]
  const lines = renderFailures({ failures, total: 85, runtime: 'Node 24.19.0 (CI-EQUIVALENT)' })

  test('every failing guard is named', () => {
    for (const f of failures) {
      expect(lines.some((l) => l.includes(f.guard))).toBe(true)
    }
  })

  test('the LAST line names them all, because a build log is read from the bottom', () => {
    expect(lines.at(-1)).toBe(
      '[guards] FAILED: scripts/guards/curated-categories-exist.mjs, scripts/guards/schema-ahead-of-code.mjs',
    )
  })

  test('the count and the names cannot disagree', () => {
    const summary = lines.find((l) => l.includes('guard(s) FAILED'))
    expect(summary).toBe('[guards] 2 of 85 guard(s) FAILED. Build blocked.')
    const named = lines.at(-1)!.replace('[guards] FAILED: ', '').split(', ')
    expect(named).toHaveLength(failures.length)
  })

  test('it hands back the command that reads what the guard caught', () => {
    expect(lines.some((l) => l.includes('node scripts/guards/curated-categories-exist.mjs'))).toBe(true)
  })

  test('the reason travels with the name, so three different faults stay three', () => {
    const mixed = renderFailures({
      failures: [
        { guard: 'a.mjs', reason: 'exit 2' },
        { guard: 'b.mjs', reason: 'killed by signal SIGKILL' },
        { guard: 'c.mjs', reason: 'could not be started: spawn ENOENT' },
      ],
      total: 3,
      runtime: 'Node 24',
    })
    expect(mixed.some((l) => l.includes('a.mjs  (exit 2)'))).toBe(true)
    expect(mixed.some((l) => l.includes('b.mjs  (killed by signal SIGKILL)'))).toBe(true)
    expect(mixed.some((l) => l.includes('c.mjs  (could not be started: spawn ENOENT)'))).toBe(true)
  })

  /*
   * ATTRIBUTED TO THE GUARD THAT RAISED IT. Close-out F2.3 asks for the
   * exception "printed with its message and the first line of its stack", and
   * the word ATTRIBUTED is the requirement: the message has to arrive under the
   * name of the file it came out of, not somewhere else in a log that a CI web
   * view truncates and a Vercel build log paginates.
   */
  test('a throw prints its message and first frame directly under the guard that raised it', () => {
    const lines = renderFailures({
      failures: [
        { guard: 'quiet.mjs', reason: 'exit 1' },
        {
          guard: 'broken.mjs',
          reason: 'threw, exit 1',
          thrown: { message: 'Error: Command failed: git ls-files -z', frame: 'at genericNodeError (node:internal/errors:983:15)' },
        },
      ],
      total: 2,
      runtime: 'Node 24',
    })
    const at = lines.findIndex((l) => l.includes('broken.mjs  (threw, exit 1)'))
    expect(at).toBeGreaterThan(-1)
    expect(lines[at + 1]).toContain('it threw: Error: Command failed: git ls-files -z')
    expect(lines[at + 2]).toContain('first frame: at genericNodeError')
    // and the guard that merely decided gets no throw lines invented for it
    const quietAt = lines.findIndex((l) => l.includes('quiet.mjs  (exit 1)'))
    expect(lines[quietAt + 1]).not.toContain('it threw')
  })
})

describe('thrownFrom', () => {
  test('no stack frames means the guard decided rather than broke', () => {
    expect(thrownFrom('[x] FAIL: three violations\n[x] fix them\n')).toBeNull()
    expect(thrownFrom('')).toBeNull()
  })

  test("the message is the error line, not the source line Node echoes above it", () => {
    const stderr = [
      'file:///repo/scripts/guards/x.mjs:12',
      "  throw new Error('no repository here')",
      '        ^',
      '',
      'Error: no repository here',
      '    at file:///repo/scripts/guards/x.mjs:12:9',
      '    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)',
    ].join('\n')
    expect(thrownFrom(stderr)).toEqual({
      message: 'Error: no repository here',
      frame: 'at file:///repo/scripts/guards/x.mjs:12:9',
    })
  })

  test('the FIRST frame is taken, because the last one is always node internals', () => {
    const stderr = 'Error: boom\n    at theGuard (/repo/a.mjs:1:1)\n    at node:internal/main/run_main_module:36:49'
    expect(thrownFrom(stderr)?.frame).toBe('at theGuard (/repo/a.mjs:1:1)')
  })
})
