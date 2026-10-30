import { describe, expect, test } from 'vitest'
import { fourLevels, levelLines, venueLevels } from '@/lib/growth/four-levels'
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
  test('a night sold on another site: exposure, interest and booking intent counted; the sale not visible to us', () => {
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

describe('the words', () => {
  test('booking intent is never called a sale, and an unseen sale says so', () => {
    const lines = levelLines(venueLevels([fourLevels(night())]), { siteNamed: 'the booking site' })
    expect(lines).toHaveLength(4)
    expect(lines[2]).toBe('Booking intent: 9 people went on to book (a press to the booking site, never counted as a sale)')
    expect(lines[3]).toBe('Verified sale: not visible to us for 1 night sold on the booking site')
  })
  test('our own sales are said as orders and tickets', () => {
    const lines = levelLines(venueLevels([fourLevels(night({ onEventLinqs: { orders: 3, tickets: 7 } }))]), { siteNamed: 'the booking site' })
    expect(lines[3]).toBe('Verified sale: 3 orders, 7 tickets on EventLinqs')
  })
})
