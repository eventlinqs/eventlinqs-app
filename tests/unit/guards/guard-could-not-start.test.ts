import { describe, expect, test } from 'vitest'
import { describeOutcome, launchFailure, transportOnlyFailure } from '../../../scripts/guards/lib/guard-run-report.mjs'

/*
 * A GUARD THAT NEVER STARTED (the guard audit of 14 November 2026, C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md). On
 * 12 November at 20:50 six guards exited 3221225794 (Windows 0xC0000142) in one gate: node could not start on a machine
 * short of memory, and six faults were reported that the code did not have. Such a guard is started again once, alone.
 */
const ended = (status: number | null, extra: Record<string, unknown> = {}) => ({ status, signal: null, stdout: '', stderr: '', error: undefined, ...extra })

describe('a guard that could not start is told apart from a guard that found a fault', () => {
  test('Windows 0xC0000142 and 0xC0000017 are could-not-start', () => {
    expect(launchFailure(ended(3221225794))).toMatch(/0xC0000142/)
    expect(launchFailure(ended(3221225495))).toMatch(/0xC0000017/)
  })

  test('a spawn error for want of memory or handles is could-not-start', () => {
    for (const code of ['EAGAIN', 'ENOMEM', 'EMFILE', 'ENFILE']) {
      expect(launchFailure(ended(null, { error: Object.assign(new Error(code), { code }) })), code).toBe(`spawn ${code}`)
    }
  })

  test('a guard that started and failed is never could-not-start', () => {
    expect(launchFailure(ended(1, { stdout: 'FAIL: 1 thing found' }))).toBeNull()
    expect(launchFailure(ended(0))).toBeNull()
    expect(launchFailure(ended(null, { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }))).toBeNull()
  })

  test('the report names the machine, not a finding', () => {
    expect(describeOutcome(ended(3221225794))).toEqual({
      ok: false,
      reason: 'could not start (Windows 0xC0000142, the process could not initialise): the machine, not a fault the guard found',
    })
    expect(describeOutcome(ended(1)).reason).toBe('exit 1')
  })

  test('a could-not-start result is not mistaken for a network failure', () => {
    expect(transportOnlyFailure(ended(3221225794))).toBeNull()
  })
})
