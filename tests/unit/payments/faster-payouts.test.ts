// Faster payouts for proven organisers (src/lib/payments/faster-payouts.ts; item 21; the rule in
// supabase/migrations/20261027160001_faster_payouts.sql). Pinned: everyone not switched on and qualifying is paid exactly
// as before; a qualifying organiser is paid after their own shorter buffer, never a longer one; the scan widens only
// as far as the shortest live grant.

import { describe, expect, test } from 'vitest'
import { dueForDisbursement, scanCutoff } from '@/lib/payments/faster-payouts'

const NOW = new Date('2026-10-27T08:00:00Z')
const endedDaysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('when held funds are due', () => {
  test('past the platform\'s buffer, for everyone, as before', () => {
    expect(dueForDisbursement({ endDate: endedDaysAgo(3), now: NOW, bufferDays: 3, faster: null })).toBe(true)
    expect(dueForDisbursement({ endDate: endedDaysAgo(2.9), now: NOW, bufferDays: 3, faster: null })).toBe(false)
  })

  test('sooner only for an organiser switched on who still qualifies, after the buffer Lawal set', () => {
    const qualifies = { qualifies: true, bufferDays: 1 }
    expect(dueForDisbursement({ endDate: endedDaysAgo(1), now: NOW, bufferDays: 3, faster: qualifies })).toBe(true)
    expect(dueForDisbursement({ endDate: endedDaysAgo(0.5), now: NOW, bufferDays: 3, faster: qualifies })).toBe(false)
  })

  test('never sooner for one who does not qualify, whatever their grant says', () => {
    expect(dueForDisbursement({ endDate: endedDaysAgo(1), now: NOW, bufferDays: 3, faster: { qualifies: false, bufferDays: 1 } })).toBe(false)
    expect(dueForDisbursement({ endDate: endedDaysAgo(1), now: NOW, bufferDays: 3, faster: { qualifies: true, bufferDays: null } })).toBe(false)
  })

  test('never later than the platform\'s buffer, even where a grant says more', () => {
    expect(dueForDisbursement({ endDate: endedDaysAgo(3), now: NOW, bufferDays: 3, faster: { qualifies: true, bufferDays: 10 } })).toBe(true)
  })

  test('not for an event with no readable end', () => {
    expect(dueForDisbursement({ endDate: 'not a date', now: NOW, bufferDays: 3, faster: null })).toBe(false)
  })
})

describe('how far the run looks', () => {
  test('to the platform\'s buffer with no grants, and to the shortest live grant with some', () => {
    expect(scanCutoff(NOW, 3, [])).toBe(endedDaysAgo(3))
    expect(scanCutoff(NOW, 3, [2, 1])).toBe(endedDaysAgo(1))
    expect(scanCutoff(NOW, 3, [5])).toBe(endedDaysAgo(3))
  })
})
