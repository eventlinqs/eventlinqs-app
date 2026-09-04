import { describe, expect, test } from 'vitest'
import {
  formatClock,
  pluralTickets,
  pluralScans,
  describeSet,
  describeMode,
  describePending,
  describeSyncSummary,
  describeFlag,
  describeDoorOutcome,
  STALE_SET_REASON,
} from '@/lib/scanner/door-copy'
import { expiryFor } from '@/lib/scanner/offline-validate'
import type { DoorSetMeta } from '@/lib/scanner/door-types'

/**
 * The words on the door. Times are built from LOCAL components so the
 * expectations hold in every zone the suite runs in.
 */

const NOW = new Date(2026, 8, 5, 16, 0, 0).getTime()
const AT = (dayOffset: number, h: number, m: number) => new Date(2026, 8, 5 + dayOffset, h, m, 0).toISOString()

function meta(downloadedAt: string): DoorSetMeta {
  return { eventId: 'e', eventTitle: 'Open Field Party', downloadedAt, expiresAt: expiryFor(downloadedAt), ticketCount: 3, deviceId: 'd', version: 1 }
}

const BANNED = /[–—!]/

describe('formatClock', () => {
  test('today is the time alone', () => {
    expect(formatClock(AT(0, 16, 12), NOW)).toBe('4:12 pm')
  })
  test('tomorrow and yesterday are named', () => {
    expect(formatClock(AT(1, 16, 12), NOW)).toBe('tomorrow 4:12 pm')
    expect(formatClock(AT(-1, 9, 5), NOW)).toBe('yesterday 9:05 am')
  })
  test('further away carries the weekday', () => {
    const iso = AT(3, 16, 12)
    const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(new Date(iso))
    expect(formatClock(iso, NOW)).toBe(`${day} 4:12 pm`)
  })
  test('an unreadable time is empty rather than "Invalid Date"', () => {
    expect(formatClock('nope', NOW)).toBe('')
  })
})

describe('the strip', () => {
  test('no set yet says the list is downloading', () => {
    expect(describeSet(null, 0, NOW)).toBe('Downloading the door list for offline scanning.')
  })
  test('a ready set says how many, when, and until when', () => {
    expect(describeSet(meta(AT(0, 16, 12)), 1240, NOW)).toBe('Offline ready. 1,240 tickets, downloaded 4:12 pm, valid until tomorrow 4:12 pm.')
  })
  test('one ticket is singular', () => {
    expect(describeSet(meta(AT(0, 15, 0)), 1, NOW)).toContain('1 ticket,')
  })
  test('an expired set says so and asks for a refresh', () => {
    expect(describeSet(meta(AT(-2, 16, 12)), 3, NOW)).toBe(`${STALE_SET_REASON}. Refresh it to keep scanning offline.`)
  })
  test('the mode words', () => {
    expect(describeMode(true, true)).toBe('Online')
    expect(describeMode(false, true)).toBe('Offline, scanning against the door list')
    expect(describeMode(false, false)).toBe('Offline, and no door list on this phone')
  })
  test('pending and sync summaries count in plain words', () => {
    expect(describePending(0)).toBe('')
    expect(describePending(1)).toBe('1 scan waiting to sync')
    expect(describePending(12)).toBe('12 scans waiting to sync')
    expect(describeSyncSummary({ synced: 0, admitted: 0, needsReview: 0, flagged: [] })).toBe('')
    expect(describeSyncSummary({ synced: 2, admitted: 2, needsReview: 0, flagged: [] })).toBe('2 scans synced.')
    expect(describeSyncSummary({ synced: 3, admitted: 2, needsReview: 1, flagged: [] })).toBe('3 scans synced, 1 needs review.')
    expect(describeSyncSummary({ synced: 4, admitted: 2, needsReview: 2, flagged: [] })).toBe('4 scans synced, 2 need review.')
    expect(pluralTickets(1)).toBe('1 ticket')
    expect(pluralScans(2)).toBe('2 scans')
  })
})

describe('describeFlag', () => {
  test('another door first', () => {
    expect(describeFlag({ result: 'already_scanned', holderName: 'Robin Ashe' }, 'EL-2345-6789')).toBe(
      'EL-2345-6789 (Robin Ashe) was admitted at another door first. The organiser can review it under Attendees.',
    )
  })
  test('refunded, not found, and anything else', () => {
    expect(describeFlag({ result: 'refunded', holderName: null }, 'EL-2345-6789')).toMatch(/had been refunded before this phone admitted it/)
    expect(describeFlag({ result: 'not_found', holderName: null }, 'EL-2345-6789')).toMatch(/no longer matches a ticket/)
    expect(describeFlag({ result: 'wrong_event', holderName: null }, 'EL-2345-6789')).toMatch(/could not be admitted on the server \(wrong event\)/)
  })
})

describe('describeDoorOutcome', () => {
  const base = { holderName: null, tierName: null, seatLabel: null, judgedBy: 'device' as const }
  test('a stale set is a reject that says why', () => {
    const v = describeDoorOutcome({ ...base, result: 'stale_set', firstScannedAt: null }, NOW)
    expect(v.decision).toBe('reject')
    expect(v.reason).toBe(`${STALE_SET_REASON}. Reconnect to refresh it.`)
  })
  test('already used carries how long ago, against the given clock', () => {
    const v = describeDoorOutcome({ ...base, result: 'already_scanned', firstScannedAt: new Date(NOW - 2 * 60 * 1000).toISOString() }, NOW)
    expect(v.reason).toBe('Already used 2 minutes ago')
  })
  test('admitted is ADMIT', () => {
    expect(describeDoorOutcome({ ...base, result: 'admitted', firstScannedAt: null }, NOW)).toEqual({ decision: 'admit', label: 'ADMIT', reason: '' })
  })
})

describe('the copy law', () => {
  test('no em dash, en dash or exclamation mark anywhere the door speaks', () => {
    const lines = [
      describeSet(null, 0, NOW),
      describeSet(meta(AT(0, 16, 12)), 1240, NOW),
      describeSet(meta(AT(-2, 16, 12)), 3, NOW),
      describeMode(true, true),
      describeMode(false, true),
      describeMode(false, false),
      describePending(3),
      describeSyncSummary({ synced: 3, admitted: 2, needsReview: 1, flagged: [] }),
      describeFlag({ result: 'already_scanned', holderName: 'A' }, 'EL'),
      describeFlag({ result: 'refunded', holderName: null }, 'EL'),
      describeFlag({ result: 'not_found', holderName: null }, 'EL'),
      describeFlag({ result: 'void', holderName: null }, 'EL'),
      describeDoorOutcome({ result: 'stale_set', holderName: null, tierName: null, seatLabel: null, firstScannedAt: null, judgedBy: 'device' }, NOW).reason,
    ]
    for (const line of lines) expect(line, line).not.toMatch(BANNED)
  })
})
