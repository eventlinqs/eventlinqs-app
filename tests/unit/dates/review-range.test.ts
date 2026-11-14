import { describe, it, expect } from 'vitest'
import { formatReviewRange, zoneWords } from '@/lib/dates/review-range'

describe('the review step writes the event time as a person reads it (the PM 22:42, fix 1)', () => {
  it('writes one date when the start and the end share a day, and the zone as its city', () => {
    expect(formatReviewRange('2026-12-05T19:00', '2026-12-05T22:00', 'Australia/Melbourne')).toBe(
      'Sat 5 Dec 2026, 7:00 to 10:00 pm, Melbourne time',
    )
  })
  it('names both halves of the day when the event crosses noon', () => {
    expect(formatReviewRange('2026-12-05T11:00', '2026-12-05T14:30', 'Australia/Sydney')).toBe(
      'Sat 5 Dec 2026, 11:00 am to 2:30 pm, Sydney time',
    )
  })
  it('writes both dates when the event runs past midnight', () => {
    expect(formatReviewRange('2026-12-05T21:00', '2026-12-06T02:00', 'Australia/Brisbane')).toBe(
      'Sat 5 Dec 2026, 9:00 pm to Sun 6 Dec 2026, 2:00 am, Brisbane time',
    )
  })
  it('reads midnight and noon on the twelve hour clock', () => {
    expect(formatReviewRange('2026-12-05T00:00', '2026-12-05T12:00', 'Australia/Perth')).toBe(
      'Sat 5 Dec 2026, 12:00 am to 12:00 pm, Perth time',
    )
  })
  it('never prints a raw zone id, and adds nothing for no zone', () => {
    expect(zoneWords('Australia/Lord_Howe')).toBe('Lord Howe time')
    expect(formatReviewRange('2026-12-05T19:00', '2026-12-05T22:00', null)).toBe('Sat 5 Dec 2026, 7:00 to 10:00 pm')
  })
  it('says nothing when there is no start yet', () => {
    expect(formatReviewRange('', '', 'Australia/Melbourne')).toBe('-')
  })
})
