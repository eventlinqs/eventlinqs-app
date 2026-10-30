import { describe, expect, test } from 'vitest'
import { fourLevels, levelFigures, levelLines, nightFiguresFrom, venueLevels } from '@/lib/growth/four-levels'
import type { NightFigures } from '@/lib/growth/organiser-report-math'

/**
 * THE FOUR HONEST LEVELS (Lawal's final blueprint of 30 October 2026, section 7; the PROJECT MANAGER's 17:25: "the
 * venue partnership report shows the four honest levels (exposure, interest, booking intent, verified sale) and never
 * more"). Read from the night's kept figures (organiser-report-math nightFigures), never recounted.
 */

const night = (over: Partial<NightFigures> = {}): NightFigures => ({
  version: 1,
  numbers: {} as NightFigures['numbers'],
  reach: { totals: { views: 0, clicks: 0 }, byChannel: [] },
  viewers: 40,
  ownLink: null,
  instagramReach: null,
  pressesOut: { people: 9, bySite: [{ provider: 'oztix', people: 9 }] },
  onEventLinqs: null,
  posts: [{ pieceId: 'p1', platform: 'instagram', postUrl: 'https://instagram.com/p/x', postedAt: '2026-10-28T09:00:00.000Z', nightsNamed: 3, goPresses: 5 }],
  ...over,
})

describe('one night, four levels and never more', () => {
  test('a night not ticketed on EventLinqs: exposure, interest and booking intent counted; the sale not visible to us', () => {
    expect(fourLevels(night())).toEqual({
      exposure: { posts: 1, goTaps: 5, instagramReachEntered: null },
      interest: { people: 40 },
      bookingIntent: { people: 9 },
      verifiedSale: { orders: null, tickets: null },
    })
  })
  test('a night EventLinqs sells: its standing orders are the verified sale', () => {
    expect(fourLevels(night({ onEventLinqs: { orders: 3, tickets: 7 } })).verifiedSale).toEqual({ orders: 3, tickets: 7 })
  })
  test("Instagram's reach is kept as entered, apart from the counted posts", () => {
    expect(fourLevels(night({ instagramReach: { value: 812, readAt: '2026-10-29T01:00:00.000Z' } })).exposure.instagramReachEntered).toBe(812)
  })
  test('the reading has exactly the four levels', () => {
    expect(Object.keys(fourLevels(night()))).toEqual(['exposure', 'interest', 'bookingIntent', 'verifiedSale'])
  })
})

describe('a venue, its nights added', () => {
  test('counted levels add; a sale is known only where we sell, and the nights it cannot see are counted', () => {
    const v = venueLevels([fourLevels(night()), fourLevels(night({ viewers: 10, pressesOut: { people: 0, bySite: [] }, onEventLinqs: { orders: 2, tickets: 4 }, posts: [] }))])
    expect(v).toEqual({
      nights: 2,
      exposure: { posts: 1, goTaps: 5, instagramReachEntered: null },
      interest: { people: 50 },
      bookingIntent: { people: 9 },
      verifiedSale: { orders: 2, tickets: 4, nightsNotVisible: 1 },
    })
  })
  test('no nights reads as nothing, not as zero sales seen', () => {
    expect(venueLevels([]).verifiedSale).toEqual({ orders: null, tickets: null, nightsNotVisible: 0 })
  })
})

describe('on /admin/today, the distribution results of the nights reported in the last 28 days', () => {
  test('four figures, weekly, measures that ask nothing of Lawal; booking intent named as never a sale', () => {
    const figs = levelFigures(venueLevels([fourLevels(night()), fourLevels(night({ onEventLinqs: { orders: 2, tickets: 5 } }))]))
    expect(figs.map((f) => f.label)).toEqual([
      'Exposure: posts and taps on their links',
      'Interest: people who opened the listing',
      'Booking intent: people sent on to book',
      'Verified sale: orders on EventLinqs',
    ])
    expect(figs.every((f) => f.cadence === 'weekly' && f.kind === 'measure' && f.asksForAPerson === false)).toBe(true)
    expect(figs[0]).toMatchObject({ value: 2, display: '2 posts, 10 taps' })
    expect(figs[2]).toMatchObject({ value: 18, note: 'a press to the booking site, never counted as a sale' })
    expect(figs[3]).toMatchObject({ value: 2, display: '2 orders, 5 tickets; 1 night not ticketed on EventLinqs (free entry or another site), any sale not visible to us' })
  })
  test('no reported nights reads as not counted, never as zero sales', () => {
    const figs = levelFigures(venueLevels([]))
    expect(figs.every((f) => f.value === null)).toBe(true)
    expect(figs[0].note).toBe('no night report kept in the last 28 days')
  })
})

describe('the words', () => {
  test('booking intent is never called a sale, and an unseen sale says so', () => {
    const lines = levelLines(venueLevels([fourLevels(night())]))
    expect(lines).toHaveLength(4)
    expect(lines[2]).toBe('Booking intent: 9 people went on to book (a press to the booking site, never counted as a sale)')
    expect(lines[3]).toBe('Verified sale: 1 night not ticketed on EventLinqs (free entry or another site), any sale not visible to us')
  })
  test('our own sales are said as orders and tickets', () => {
    const lines = levelLines(venueLevels([fourLevels(night({ onEventLinqs: { orders: 3, tickets: 7 } }))]))
    expect(lines[3]).toBe('Verified sale: 3 orders, 7 tickets on EventLinqs')
  })
})

describe('a kept report read back from organiser_night_reports.figures', () => {
  test('a version 1 report reads back as the night it kept', () => {
    const kept = JSON.parse(JSON.stringify(night({ onEventLinqs: { orders: 1, tickets: 2 } })))
    expect(fourLevels(nightFiguresFrom(kept) as NightFigures).verifiedSale).toEqual({ orders: 1, tickets: 2 })
  })
  test('another version or a broken shape is not read, never guessed', () => {
    expect(nightFiguresFrom({ ...night(), version: 2 })).toBeNull()
    expect(nightFiguresFrom({ ...night(), viewers: 'many' })).toBeNull()
    expect(nightFiguresFrom({ ...night(), posts: null })).toBeNull()
    expect(nightFiguresFrom(null)).toBeNull()
  })
})
