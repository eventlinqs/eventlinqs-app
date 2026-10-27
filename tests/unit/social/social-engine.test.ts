import { describe, expect, test } from 'vitest'
import { bestBands, bestGap, GAP_BOUNDS, hourOfWeek, learn, nextAllowed, nextSlot, SOCIAL_ZONE, type CadenceRule, type PostOutcome } from '@/lib/social/cadence'
import { factsOf, kitCaption, listingPriceLabel, plan, postKey, type PlanCandidate } from '@/lib/social/plan'
import { resultOf, type CreditedOrder, type LinkEvent } from '@/lib/social/results'
import { strayNumbers, wordsRefusal } from '@/lib/social/words'
import { soldOut } from '@/lib/social/store'
import type { BookingLink } from '@/lib/events/booking-links'
import type { CaptionInput } from '@/lib/broadcast/captions'

/**
 * Item 11, the social engine (docs/SOCIAL-ENGINE.md): what is posted, what a post may say, what it brought, and how
 * often posts go, each from EventLinqs' own rows. The database holds the same rules (20261027233001); its proof is
 * scripts/verify/social-engine-proof.sql on TEST.
 */

const NOW = new Date('2026-10-28T09:00:00+11:00')
const H = 3_600_000

const STARTING: CadenceRule = { version: 1, gapHours: 12, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 12, settleHours: 48, setAt: new Date('2026-10-27T00:00:00+11:00') }

const candidate = (over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  eventId: 'e1',
  title: 'Bar Humbug Comedy',
  startDate: '2026-10-30T09:00:00Z',
  endDate: '2026-10-30T12:00:00Z',
  status: 'published',
  visibility: 'public',
  city: 'Melbourne',
  hasPhoto: true,
  soldOut: false,
  ...over,
})

describe('what is posted this week', () => {
  test('each published, public event inside the week gets a feed card and a story on Instagram', () => {
    const items = plan([candidate()], new Set(), NOW)
    expect(items.map((i) => `${i.platform} ${i.format}`)).toEqual(['instagram feed', 'instagram story'])
  })

  test('an unlisted, ended, sold out or later event is never posted, nor one already planned', () => {
    const items = plan(
      [
        candidate({ eventId: 'unlisted', visibility: 'unlisted' }),
        candidate({ eventId: 'draft', status: 'draft' }),
        candidate({ eventId: 'ended', endDate: '2026-10-27T12:00:00Z' }),
        candidate({ eventId: 'sold', soldOut: true }),
        candidate({ eventId: 'later', startDate: '2026-11-20T09:00:00Z', endDate: '2026-11-20T12:00:00Z' }),
        candidate({ eventId: 'done' }),
      ],
      new Set([postKey('done', 'instagram', 'feed'), postKey('done', 'instagram', 'story')]),
      NOW,
    )
    expect(items).toEqual([])
  })

  test('photo first, then the soonest', () => {
    const items = plan(
      [candidate({ eventId: 'late-photo', startDate: '2026-11-01T09:00:00Z', endDate: '2026-11-01T12:00:00Z' }), candidate({ eventId: 'no-photo', hasPhoto: false }), candidate({ eventId: 'soon-photo' })],
      new Set(),
      NOW,
    )
    expect([...new Set(items.map((i) => i.eventId))]).toEqual(['soon-photo', 'late-photo', 'no-photo'])
  })
})

const link = (over: Partial<BookingLink> = {}): BookingLink => ({
  id: 'l1',
  provider: 'humanitix',
  url: 'https://events.humanitix.com/x',
  kind: 'tickets',
  availability: 'on_sale',
  priceFromCents: 3550,
  priceCheckedAt: '2026-10-28T06:00:00+11:00',
  isPrimary: true,
  setBy: 'curated',
  pointedToByOrganiser: false,
  position: 0,
  createdAt: '2026-10-27T00:00:00Z',
  ...over,
})

describe('a curated listing says its own price line, never "Free entry" over a paid night', () => {
  test('a price read within the day', () => expect(listingPriceLabel([link()], false, NOW)).toBe('From $35.50'))
  test('a price older than a day names where it sells', () =>
    expect(listingPriceLabel([link({ priceCheckedAt: '2026-10-26T06:00:00+11:00' })], false, NOW)).toBe('Tickets on Humanitix'))
  test('a free registration', () => expect(listingPriceLabel([link({ kind: 'free_register', priceFromCents: null })], true, NOW)).toBe('Free, register on Humanitix'))
  test('a free night with no link', () => expect(listingPriceLabel([], true, NOW)).toBe('Free entry'))
  test('no link and not free says nothing', () => expect(listingPriceLabel([], false, NOW)).toBeNull())
})

const input: CaptionInput = {
  title: 'Dead Funny Club',
  summary: 'Five comics, one late show.',
  dateLabel: 'Friday 30 October',
  timeLabel: '8:00 pm',
  shortDateLabel: 'Fri 30 Oct',
  venueName: 'Bar Humbug',
  city: 'Melbourne',
  priceLabel: 'From $35.50',
  organiserName: 'Dead Funny Club',
  categorySlug: 'comedy',
  links: { fallback: 'https://www.eventlinqs.com.au/events/dead-funny' },
}
const POST_LINK = 'https://www.eventlinqs.com.au/e/Ab3dE5gH7k'

describe('a post states only what the listing holds', () => {
  test('the Launch Kit caption carries the post own link and passes', () => {
    const words = kitCaption(input, 'instagram', POST_LINK)
    expect(words).toContain(POST_LINK)
    expect(words).not.toContain('/events/dead-funny')
    expect(wordsRefusal(words, POST_LINK, factsOf(input))).toBeNull()
  })

  test('a number the listing does not hold is refused, the link digits not counted', () => {
    expect(strayNumbers(`Only 12 left. ${POST_LINK}`, POST_LINK, factsOf(input))).toEqual(['12'])
    expect(wordsRefusal(`Friday 30 October, from $35.50. Only 12 left. ${POST_LINK}`, POST_LINK, factsOf(input))).toBe('The words state 12, which the listing does not hold.')
    expect(wordsRefusal(`Friday 30 October, 8:00 pm, from $35.50. ${POST_LINK}`, POST_LINK, factsOf(input))).toBeNull()
  })

  test('words without the post link, with a long dash or an exclamation mark are refused', () => {
    expect(wordsRefusal('Friday night at Bar Humbug.', POST_LINK, factsOf(input))).toMatch(/own link/)
    expect(wordsRefusal(`Friday — Bar Humbug ${POST_LINK}`, POST_LINK, factsOf(input))).toMatch(/long dash/)
    expect(wordsRefusal(`Friday at Bar Humbug! ${POST_LINK}`, POST_LINK, factsOf(input))).toMatch(/exclamation/)
  })
})

describe('sold out, as the database counts it', () => {
  const tier = (total: number, sold: number, reserved = 0, active = true) => ({ total_capacity: total, sold_count: sold, reserved_count: reserved, is_active: active })
  test('a ticketed event by its active tiers', () => {
    expect(soldOut([tier(100, 100)], [])).toBe(true)
    expect(soldOut([tier(100, 90, 10)], [])).toBe(true)
    expect(soldOut([tier(100, 99), tier(50, 0, 0, false)], [])).toBe(false)
  })
  test('a listing by its live links', () => {
    expect(soldOut([], [{ availability: 'sold_out' }, { availability: 'dead' }])).toBe(true)
    expect(soldOut([], [{ availability: 'sold_out' }, { availability: 'on_sale' }])).toBe(false)
    expect(soldOut([], [])).toBe(false)
  })
})

describe('what a post brought: tickets and money first, then arrivals and presses out, inside 30 days', () => {
  const posted = new Date('2026-10-28T09:00:00Z')
  const ev = (kind: LinkEvent['kind'], at: string, orderId: string | null = null, linkId = 'L'): LinkEvent => ({ linkId, kind, orderId, occurredAt: at })
  const orders = new Map<string, CreditedOrder>([
    ['o1', { id: 'o1', status: 'confirmed', totalCents: 7100, tickets: 2 }],
    ['o2', { id: 'o2', status: 'refunded', totalCents: 3550, tickets: 1 }],
    ['o3', { id: 'o3', status: 'confirmed', totalCents: 3550, tickets: 1 }],
  ])
  test('counted from its own link, in its window, each order once, a refunded order not', () => {
    const r = resultOf(
      'L',
      posted,
      [
        ev('click', '2026-10-28T10:00:00Z'),
        ev('click', '2026-10-29T10:00:00Z'),
        ev('click', '2026-10-28T08:00:00Z'),
        ev('click', '2026-10-28T10:00:00Z', null, 'other'),
        ev('outbound', '2026-10-28T11:00:00Z'),
        ev('conversion', '2026-10-28T12:00:00Z', 'o1'),
        ev('conversion', '2026-10-28T12:00:01Z', 'o1'),
        ev('conversion', '2026-10-28T12:00:00Z', 'o2'),
        ev('conversion', '2026-12-28T12:00:00Z', 'o3'),
        ev('view', '2026-10-28T10:00:00Z'),
      ],
      orders,
    )
    expect(r).toEqual({ arrived: 2, pressedOut: 1, tickets: 2, cents: 7100, orders: 1 })
  })
  test('a post that has not gone has brought nothing', () => {
    expect(resultOf('L', null, [ev('click', '2026-10-28T10:00:00Z')], orders).arrived).toBe(0)
  })
})

describe('how often and when, learned from our own posts against tickets sold', () => {
  /* Monday 26 October 2026 at midnight in Melbourne. */
  const MON = new Date('2026-10-25T13:00:00Z')
  const at = (hourOfWeekNow: number, weeks = 0) => new Date(MON.getTime() + (weeks * 168 + hourOfWeekNow) * H)
  const post = (how: number, tickets: number, visits: number, weeks = 0): PostOutcome => ({ postedAt: at(how, weeks), tickets, visits })

  test('hours of the week on Melbourne clock', () => {
    expect(hourOfWeek(SOCIAL_ZONE, MON)).toBe(0)
    expect(hourOfWeek(SOCIAL_ZONE, at(19))).toBe(19)
  })

  test('bands ranked by tickets a post before visits, each on two posts or more', () => {
    const posts = [post(18, 3, 1), post(19, 3, 1), post(9, 0, 50), post(10, 0, 50), post(12, 9, 9)]
    expect(bestBands(SOCIAL_ZONE, posts)).toEqual([18, 9])
  })

  test('the gap from the weekly count that sold the most a week, bounded', () => {
    const twoWeeks = [post(1, 1, 0, 0), post(30, 1, 0, 0), post(1, 1, 0, 1), post(30, 1, 0, 1)]
    const fourWeeks = [0, 20, 40, 60].map((h) => post(h, 3, 0, 2)).concat([0, 20, 40, 60].map((h) => post(h, 3, 0, 3)))
    expect(bestGap(SOCIAL_ZONE, [...twoWeeks, ...fourWeeks], GAP_BOUNDS.feed)).toBe(42)
    expect(bestGap(SOCIAL_ZONE, [post(1, 1, 0, 0)], GAP_BOUNDS.feed)).toBeNull()
    const many = Array.from({ length: 40 }, (_, i) => post(i * 4, 1, 0, 0)).concat(Array.from({ length: 40 }, (_, i) => post(i * 4, 1, 0, 1)))
    expect(bestGap(SOCIAL_ZONE, many, GAP_BOUNDS.feed)).toBe(12)
  })

  test('below twelve settled posts there is no baseline and the starting rule stands', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => post(i * 12, 1, 1, 0))
    const now = new Date(MON.getTime() + 400 * H)
    /* Five more that went inside the last 48 hours have not settled, so they do not count. */
    const fresh = Array.from({ length: 5 }, (_, i) => ({ postedAt: new Date(now.getTime() - i * H), tickets: 9, visits: 9 }))
    const out = learn({ current: STARTING, format: 'feed', posts: [...eleven, ...fresh], now })
    expect(out).toMatchObject({ state: 'no_baseline', posts: 11, floor: 12 })
  })

  test('twelve settled posts learn a rule, and the same posts learn nothing new', () => {
    const twelve = [...Array.from({ length: 6 }, (_, i) => post(18 + i * 24, 2, 5, 0)), ...Array.from({ length: 6 }, (_, i) => post(18 + i * 24, 2, 5, 1))]
    const now = new Date(MON.getTime() + 600 * H)
    const out = learn({ current: STARTING, format: 'feed', posts: twelve, now })
    expect(out.state).toBe('learned')
    if (out.state !== 'learned') return
    expect(out.learnedFrom).toBe(12)
    expect(out.gapHours).toBe(28)
    const again = learn({ current: { ...STARTING, basis: 'learned', gapHours: out.gapHours, slots: out.slots, learnedFrom: 12 }, format: 'feed', posts: twelve, now })
    expect(again.state).toBe('unchanged')
  })

  test('the next band and the next allowed moment', () => {
    const rule: CadenceRule = { ...STARTING, slots: [18] }
    expect(nextSlot(rule, at(19))).toEqual(at(19))
    expect(nextSlot(rule, at(10)).getTime()).toBe(at(18).getTime())
    expect(nextSlot(STARTING, at(10))).toEqual(at(10))
    expect(nextAllowed(STARTING, at(10), at(11)).getTime()).toBe(at(22).getTime())
    expect(nextAllowed(STARTING, null, at(11))).toEqual(at(11))
  })
})
