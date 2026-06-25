import { describe, expect, test } from 'vitest'
import { describeScanResult } from '@/lib/scanner/result'

describe('describeScanResult', () => {
  test('admitted is an ADMIT decision', () => {
    const r = describeScanResult('admitted')
    expect(r.decision).toBe('admit')
    expect(r.label).toBe('ADMIT')
  })

  test('every non-admitted result is a REJECT decision', () => {
    for (const code of ['already_scanned', 'refunded', 'void', 'transferred', 'wrong_event', 'not_found', 'invalid']) {
      expect(describeScanResult(code).decision).toBe('reject')
      expect(describeScanResult(code).label).toBe('REJECT')
    }
  })

  test('each reject reason is distinct and human for door staff', () => {
    expect(describeScanResult('already_scanned').reason).toBe('Already used')
    expect(describeScanResult('refunded').reason).toBe('Refunded')
    expect(describeScanResult('void').reason).toBe('Void')
    expect(describeScanResult('transferred').reason).toBe('Transferred away')
    expect(describeScanResult('wrong_event').reason).toBe('Wrong event')
    expect(describeScanResult('not_found').reason).toBe('Not found')
  })

  test('admitted has no reject reason', () => {
    expect(describeScanResult('admitted').reason).toBe('')
  })

  test('an unknown result code is treated as a safe reject, not an admit', () => {
    const r = describeScanResult('something_unexpected')
    expect(r.decision).toBe('reject')
    expect(r.reason).toBe('Not valid')
  })

  test('the reason never contains em or en dashes', () => {
    for (const code of ['admitted', 'already_scanned', 'refunded', 'void', 'transferred', 'wrong_event', 'not_found', 'invalid', 'weird']) {
      const { reason, label } = describeScanResult(code)
      expect(reason).not.toMatch(/[–—]/)
      expect(label).not.toMatch(/[–—]/)
    }
  })
})
