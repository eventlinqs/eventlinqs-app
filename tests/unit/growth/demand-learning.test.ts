import { describe, expect, test } from 'vitest'
import { MIN_NIGHTS_TO_COMPARE, MIN_PAIRS_TO_READ, compareNights, holdoutArm, holdoutReading, leadTimeBand, nightOutcomeFrom, recommendationFigure, recommendations, type NightOutcome } from '@/lib/growth/demand-learning'

/**
 * THE DEMAND LEARNING LOOP (D10 of Lawal's DemandOS directive of 30 October 2026, section 10: "Compare performance by
 * city, category, lead time, channel and creative. Recommend future campaigns based on observed results. Start with
 * explainable rules. Do not present unsupported AI predictions as facts."; the PROJECT MANAGER's 17:25: "the holdout for
 * incrementality is built into the learning loop (matched recurring nights, alternating weeks)"; the blueprint, section
 * 7: "Compare completed bookings, not just website clicks. With a small sample, the result will be directional rather
 * than conclusive.").
 */
const night = (over: Partial<NightOutcome> = {}): NightOutcome => ({
  city: 'geelong',
  category: 'music',
  leadDays: 10,
  people: 10,
  presses: 2,
  orders: null,
  ...over,
})
const many = (n: number, over: Partial<NightOutcome>) => Array.from({ length: n }, () => night(over))

describe('lead time', () => {
  test.each([[0, '0 to 1 days'], [1, '0 to 1 days'], [2, '2 to 7 days'], [7, '2 to 7 days'], [8, '8 to 20 days'], [20, '8 to 20 days'], [21, '21 days or more'], [40, '21 days or more']])('%i days is %s', (d, band) => {
    expect(leadTimeBand(d)).toBe(band)
  })
})

describe('comparing nights', () => {
  test('groups by the dimension, per night, largest first', () => {
    const out = compareNights([...many(MIN_NIGHTS_TO_COMPARE, { city: 'melbourne', people: 30, presses: 6 }), ...many(MIN_NIGHTS_TO_COMPARE, { city: 'geelong', people: 10, presses: 1 })], 'city')
    expect(out.map((g) => [g.key, g.nights, g.peoplePerNight, g.pressesPerNight])).toEqual([
      ['melbourne', MIN_NIGHTS_TO_COMPARE, 30, 6],
      ['geelong', MIN_NIGHTS_TO_COMPARE, 10, 1],
    ])
  })
  test('lead time reads through its band', () => {
    expect(compareNights([night({ leadDays: 1 }), night({ leadDays: 30 })], 'lead').map((g) => g.key).sort()).toEqual(['0 to 1 days', '21 days or more'])
  })
  test('orders count only nights we ticket, never a free or outside night as zero', () => {
    const [g] = compareNights([night({ orders: 4 }), night({ orders: null })], 'city')
    expect(g).toMatchObject({ nights: 2, nightsWeTicket: 1, ordersPerTicketedNight: 4 })
    expect(compareNights([night()], 'city')[0].ordersPerTicketedNight).toBeNull()
  })
})

describe('a recommendation', () => {
  const nights = [...many(MIN_NIGHTS_TO_COMPARE, { city: 'melbourne', people: 30 }), ...many(MIN_NIGHTS_TO_COMPARE, { city: 'geelong', people: 10 })]
  test('names what was observed, with its numbers, as an observation', () => {
    const [r] = recommendations(nights)
    expect(r).toBe(`Give melbourne more of the next plan: 30 people a night against 10 for geelong, over ${MIN_NIGHTS_TO_COMPARE} nights each. Observed, not a prediction.`)
  })
  test('lead time reads as how far ahead a night went up', () => {
    const r = recommendations([...many(MIN_NIGHTS_TO_COMPARE, { leadDays: 30, people: 30 }), ...many(MIN_NIGHTS_TO_COMPARE, { leadDays: 1, people: 10 })])
    expect(r).toContain(`Publish earlier where you can: nights up 21 days or more ahead drew 30 people a night against 10 for 0 to 1 days, over ${MIN_NIGHTS_TO_COMPARE} nights each. Observed, not a prediction.`)
  })
  test('too few nights says nothing rather than guess', () => {
    expect(recommendations(nights.slice(1))).toEqual([])
  })
  test('a small gap says nothing', () => {
    expect(recommendations([...many(MIN_NIGHTS_TO_COMPARE, { city: 'melbourne', people: 11 }), ...many(MIN_NIGHTS_TO_COMPARE, { city: 'geelong', people: 10 })])).toEqual([])
  })
})

describe('the holdout: matched recurring nights in alternating weeks', () => {
  test('one series alternates week by week, deterministic', () => {
    expect(holdoutArm('series-a', '2026-11-02')).toBe(holdoutArm('series-a', '2026-11-02'))
    expect(holdoutArm('series-a', '2026-11-02')).not.toBe(holdoutArm('series-a', '2026-11-09'))
    expect(holdoutArm('series-a', '2026-11-02')).toBe(holdoutArm('series-a', '2026-11-16'))
  })
  test('series do not all hold out in the same week', () => {
    const arms = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => holdoutArm(`series-${s}`, '2026-11-02')))
    expect(arms.size).toBe(2)
  })
  test('reads completed bookings only, and calls a small sample directional', () => {
    const pairs = Array.from({ length: MIN_PAIRS_TO_READ }, () => ({ distributedOrders: 5, heldOutOrders: 3 }))
    const r = holdoutReading(pairs)
    expect(r).toEqual({ state: 'read', pairs: MIN_PAIRS_TO_READ, ordersPerNightDistributed: 5, ordersPerNightHeldOut: 3, words: `5 bookings a night with our distribution against 3 without, over ${MIN_PAIRS_TO_READ} matched pairs. Directional, not conclusive.` })
  })
  test('too few pairs reads nothing, and never claims incremental sales', () => {
    expect(holdoutReading([{ distributedOrders: 9, heldOutOrders: 1 }])).toEqual({ state: 'too_few', pairs: 1 })
    expect(JSON.stringify(holdoutReading(Array.from({ length: MIN_PAIRS_TO_READ }, () => ({ distributedOrders: 2, heldOutOrders: 1 }))))).not.toMatch(/incremental/i)
  })
})

describe('a kept report read as an outcome', () => {
  const figures = { version: 1, viewers: 12, posts: [], instagramReach: null, pressesOut: { people: 3, bySite: [] }, onEventLinqs: null }
  test('takes the night and its place from the event', () => {
    expect(nightOutcomeFrom({ figures, city: 'geelong', category: 'Music', publishedAt: '2026-10-01T00:00:00.000Z', startDate: '2026-10-11T00:00:00.000Z' })).toEqual({ city: 'geelong', category: 'Music', leadDays: 10, people: 12, presses: 3, orders: null })
  })
  test('our own orders are read where we ticket', () => {
    expect(nightOutcomeFrom({ figures: { ...figures, onEventLinqs: { orders: 2, tickets: 5 } }, city: null, category: null, publishedAt: '2026-10-01T00:00:00.000Z', startDate: '2026-10-02T00:00:00.000Z' })?.orders).toBe(2)
  })
  test('a broken report or a night with no publish date is left out', () => {
    expect(nightOutcomeFrom({ figures: { version: 9 }, city: null, category: null, publishedAt: '2026-10-01T00:00:00.000Z', startDate: '2026-10-02T00:00:00.000Z' })).toBeNull()
    expect(nightOutcomeFrom({ figures, city: null, category: null, publishedAt: null, startDate: '2026-10-02T00:00:00.000Z' })).toBeNull()
  })
})

describe('the recommended next actions on /admin/today', () => {
  test('nothing to say reads so, and how many nights it had', () => {
    expect(recommendationFigure([], 11)).toMatchObject({ label: 'Recommended next', value: 0, kind: 'measure', cadence: 'weekly', asksForAPerson: false, display: 'Too few nights to compare yet (11 reported)' })
  })
  test('says each line it has', () => {
    expect(recommendationFigure(['One.', 'Two.'], 40)).toMatchObject({ value: 2, display: 'One. Two.' })
  })
})
