import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describeOutcome, renderFailures } from '../../../scripts/guards/lib/guard-run-report.mjs'

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

  test('a guard that throws is a failure, not a crash the runner swallows', () => {
    const result = runScript('throw new Error("the guard itself is broken")\n')
    expect(describeOutcome(result)).toEqual({ ok: false, reason: 'exit 1' })
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
})
