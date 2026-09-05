import { describe, expect, test } from 'vitest'
import { describeReviewRow, formatReviewTime } from '@/lib/reporting/door-review-copy'
import type { DoorReviewRow } from '@/lib/reporting/door-review-types'

const row = (over: Partial<DoorReviewRow> = {}): DoorReviewRow => ({
  scanId: 'scan-1',
  ticketCode: 'EL-2345-6789',
  holderName: 'Robin Ashe',
  result: 'already_scanned',
  deviceId: '9c11aaaa-0000-4000-8000-000000000000',
  deviceScannedAt: '2026-09-05T09:42:00.000Z',
  syncedAt: '2026-09-05T09:50:00.000Z',
  winner: { deviceId: '3f2abbbb-0000-4000-8000-000000000000', at: '2026-09-05T09:40:00.000Z', scannedOffline: true },
  ...over,
})

describe('formatReviewTime', () => {
  test('renders in the event zone, en-AU', () => {
    expect(formatReviewTime('2026-09-05T09:42:00.000Z', 'Australia/Melbourne')).toBe('5 Sept, 7:42 pm')
  })
  test('says so when the device did not report a time', () => {
    expect(formatReviewTime(null, 'Australia/Melbourne')).toBe('a time it did not report')
    expect(formatReviewTime('nonsense', 'Australia/Melbourne')).toBe('a time it did not report')
  })
})

describe('describeReviewRow', () => {
  test('names both doors and both times when another door won', () => {
    expect(describeReviewRow(row(), 'Australia/Melbourne')).toBe(
      'Door 9C11 admitted this ticket at 5 Sept, 7:42 pm while offline, but on sync the ticket had already been admitted. Door 3F2A had admitted it offline at 5 Sept, 7:40 pm.',
    )
  })
  test('an online winner is said to be online', () => {
    expect(describeReviewRow(row({ winner: { deviceId: null, at: '2026-09-05T09:40:00.000Z', scannedOffline: false } }), 'Australia/Melbourne')).toMatch(
      /an unknown door had admitted it online at 5 Sept, 7:40 pm\.$/,
    )
  })
  test('a refunded ticket with no winner stops at the reason', () => {
    expect(describeReviewRow(row({ result: 'refunded', winner: null }), 'Australia/Melbourne')).toBe(
      'Door 9C11 admitted this ticket at 5 Sept, 7:42 pm while offline, but on sync the ticket had been refunded.',
    )
  })
  test('an unfamiliar result is still readable', () => {
    expect(describeReviewRow(row({ result: 'wrong_event', winner: null }), null)).toMatch(/belongs to another event\.$/)
    expect(describeReviewRow(row({ result: 'odd_thing', winner: null }), null)).toMatch(/could not be admitted on the server \(odd thing\)/)
  })
  test('falls back to the sync time when the device reported none, and never uses a dash or an exclamation mark', () => {
    const text = describeReviewRow(row({ deviceScannedAt: null }), 'Australia/Melbourne')
    expect(text).toContain('at 5 Sept, 7:50 pm while offline')
    expect(text).not.toMatch(/[–—!]/)
  })
})
