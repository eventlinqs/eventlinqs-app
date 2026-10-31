// THE CONTROLLER's 11:04 of 31 October 2026: a guard that fails ONLY on a transport error is retried once after 30 s,
// logged with the error quoted; anything else fails the gate as before. Car 22's gate went red twice that morning on
// 'fetch failed' alone (8, then 5 of 233), each guard green when run alone a minute later.
import { describe, expect, test } from 'vitest'
import { transportOnlyFailure } from '../../../scripts/guards/lib/guard-run-report.mjs'

const failed = (stdout: string, stderr = '') => ({ status: 1, signal: null, stdout, stderr, error: undefined })

describe('a guard failure is retried only when it is transport alone', () => {
  test('a FAIL that names fetch failed is transport, and the error is quoted', () => {
    const r = failed('[matcher-consented-and-capped] FAIL: could not read marketing_match_invariant_breaches: TypeError: fetch failed\n')
    expect(transportOnlyFailure(r)).toMatch(/fetch failed/)
  })

  test('each named transport code counts', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']) {
      expect(transportOnlyFailure(failed(`FAIL: could not reach the database: ${code}\n`)), code).toMatch(code)
    }
  })

  test('a real finding beside a transport line is NOT retried', () => {
    const r = failed('FAIL: 1 catch block(s) discard an error\nFAIL: could not read x: TypeError: fetch failed\n')
    expect(transportOnlyFailure(r)).toBeNull()
  })

  test('a plain FAIL is not transport', () => {
    expect(transportOnlyFailure(failed('FAIL: 1 of 3 rows judged wrong\n'))).toBeNull()
  })

  test('a pass is never a transport failure', () => {
    expect(transportOnlyFailure({ status: 0, signal: null, stdout: 'PASS fetch failed once then read\n', stderr: '', error: undefined })).toBeNull()
  })

  test('a guard that could not be started is not retried', () => {
    expect(transportOnlyFailure({ status: null, signal: null, stdout: '', stderr: '', error: new Error('spawn ENOENT') })).toBeNull()
  })
})
