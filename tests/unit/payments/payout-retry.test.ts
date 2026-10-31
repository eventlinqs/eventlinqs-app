import { describe, expect, test } from 'vitest'
import { FAILURES_BEFORE_HOLD, HELD_RETRY_HOURS, retryVerdict, owedAndFailing } from '@/lib/payments/payout-retry'

/*
 * THE MKLSTUDIOS CASE (1 November 2026, C:\dev\EVIDENCE\PAYOUT-MKL-1NOV\cause.md). One event's transfer failed every
 * hour for 19 days, 448 times, 'exceeds_platform_balance', and nobody was told. The cron now attempts a failing
 * event at most once a day after two failures in a row, and the health sentinel names any event still owed money
 * whose last two transfers failed, so the founder hears the same day.
 */

const now = new Date('2026-11-01T07:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

describe('retryVerdict', () => {
  test('the rule is two failures, then once a day', () => {
    expect(FAILURES_BEFORE_HOLD).toBe(2)
    expect(HELD_RETRY_HOURS).toBe(24)
  })

  test('no history, or one failure: attempt', () => {
    expect(retryVerdict([], now)).toMatchObject({ attempt: true, consecutiveFailures: 0 })
    expect(retryVerdict([{ status: 'failed', created_at: hoursAgo(1) }], now)).toMatchObject({ attempt: true, consecutiveFailures: 1 })
  })

  test('two failures in a row an hour ago: held, and says when it may try again', () => {
    const v = retryVerdict([{ status: 'failed', created_at: hoursAgo(1) }, { status: 'failed', created_at: hoursAgo(2) }], now)
    expect(v.attempt).toBe(false)
    expect(v.consecutiveFailures).toBe(2)
    expect(v.nextAttemptAt).toBe(new Date(now.getTime() + 23 * 3_600_000).toISOString())
  })

  test('the 448 hourly failures of the MKLStudios case: one attempt a day, not 24', () => {
    const rows = Array.from({ length: 448 }, (_, i) => ({ status: 'failed', created_at: hoursAgo(i + 1) }))
    expect(retryVerdict(rows, now).attempt).toBe(false)
    const dayOld = Array.from({ length: 448 }, (_, i) => ({ status: 'failed', created_at: hoursAgo(i + 24) }))
    expect(retryVerdict(dayOld, now).attempt).toBe(true)
  })

  test('a success breaks the run: only failures since the last success count', () => {
    const v = retryVerdict([{ status: 'failed', created_at: hoursAgo(1) }, { status: 'paid', created_at: hoursAgo(2) }, { status: 'failed', created_at: hoursAgo(3) }], now)
    expect(v).toMatchObject({ attempt: true, consecutiveFailures: 1 })
  })

  test('newest first is not assumed: the rows are ordered by time inside', () => {
    const v = retryVerdict([{ status: 'failed', created_at: hoursAgo(2) }, { status: 'failed', created_at: hoursAgo(1) }], now)
    expect(v.nextAttemptAt).toBe(new Date(now.getTime() + 23 * 3_600_000).toISOString())
  })
})

describe('owedAndFailing (the alarm)', () => {
  const failing = [{ status: 'failed', created_at: hoursAgo(1), failure_reason: 'exceeds_platform_balance: claimed 4914 > platform available 0' }, { status: 'failed', created_at: hoursAgo(2), failure_reason: 'x' }]

  test('still owed and failing twice: alarm, quoting the last reason', () => {
    expect(owedAndFailing({ availableCents: 4914, transfers: failing })).toEqual({ alarm: true, consecutiveFailures: 2, lastReason: 'exceeds_platform_balance: claimed 4914 > platform available 0' })
  })

  test('settled (the ledger nets 0 or less): no alarm however many failures', () => {
    expect(owedAndFailing({ availableCents: 0, transfers: failing }).alarm).toBe(false)
    expect(owedAndFailing({ availableCents: -486, transfers: failing }).alarm).toBe(false)
  })

  test('one failure is not yet an alarm', () => {
    expect(owedAndFailing({ availableCents: 4914, transfers: failing.slice(0, 1) }).alarm).toBe(false)
  })
})
