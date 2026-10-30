import { describe, it, expect } from 'vitest'
import { bestOfWeek, figuresFor, lastWeeks, refundedOf, stateScorecard, type Rows } from '@/lib/growth/weekly-math'

/*
 * The growth page's arithmetic (src/lib/growth/weekly-math.ts): last week on the platform's clock, the five dimensions
 * counted from their own rows, seed data never counted, and Monday's best city, category and channel.
 */

// Wednesday 28 October 2026, 10:00 in Sydney (AEDT, UTC+11).
const NOW = new Date('2026-10-27T23:00:00Z')
const { last, before } = lastWeeks(NOW, 'Australia/Sydney')
const at = (local: string) => new Date(`${local}+11:00`).toISOString()

const rows: Rows = {
  listings: [
    { id: 'gig', city: 'Geelong', category: 'music', status: 'published', publishedAt: at('2026-10-20T09:00:00'), startDate: at('2026-11-06T20:00:00'), isSeed: false, recurring: true, organisationId: 'org-a' },
    { id: 'old', city: 'Melbourne', category: 'comedy', status: 'published', publishedAt: at('2026-08-31T09:00:00'), startDate: at('2026-11-01T20:00:00'), isSeed: false, recurring: false, organisationId: 'org-a' },
    { id: 'gone', city: 'Ballarat', category: 'music', status: 'published', publishedAt: at('2026-08-31T09:00:00'), startDate: at('2026-10-23T20:00:00'), isSeed: false, recurring: false, organisationId: 'org-a' },
    { id: 'seed', city: 'Geelong', category: 'music', status: 'published', publishedAt: at('2026-10-21T09:00:00'), startDate: at('2026-11-06T20:00:00'), isSeed: true, recurring: false, organisationId: 'org-a' },
    { id: 'draft', city: 'Bendigo', category: 'family', status: 'draft', publishedAt: null, startDate: at('2026-11-09T10:00:00'), isSeed: false, recurring: false, organisationId: 'org-a' },
  ],
  visits: [
    { visitor: 'v1', eventId: 'gig', at: at('2026-10-13T19:00:00'), channel: 'organic-search' },
    { visitor: 'v1', eventId: 'gig', at: at('2026-10-20T19:00:00'), channel: 'organic-search' },
    { visitor: 'v2', eventId: 'gig', at: at('2026-10-21T08:00:00'), channel: 'organic-social' },
    { visitor: 'v2', eventId: 'old', at: at('2026-10-21T08:05:00'), channel: 'organic-social' },
    { visitor: 'v3', eventId: 'old', at: at('2026-10-25T23:59:00'), channel: 'direct' },
    { visitor: 'v4', eventId: 'gig', at: at('2026-10-26T00:00:00'), channel: 'direct' },
  ],
  demand: [
    { action: 'share', at: at('2026-10-21T08:06:00') },
    { action: 'calendar_add', at: at('2026-10-22T12:00:00') },
    { action: 'follow', at: at('2026-10-14T12:00:00') },
  ],
  saves: [{ at: at('2026-10-21T08:07:00') }],
  subscribers: [{ confirmedAt: at('2026-10-24T10:00:00') }, { confirmedAt: null }],
  orders: [
    { totalCents: 4500, platformFeeCents: 300, status: 'confirmed', createdAt: at('2026-10-21T09:00:00'), organisationId: 'org-a', eventId: 'gig', retainedCents: 300, processingCents: 92 },
    { totalCents: 2000, platformFeeCents: 150, status: 'pending', createdAt: at('2026-10-21T09:10:00'), organisationId: 'org-b', eventId: 'gig', retainedCents: null, processingCents: null },
    { totalCents: 3000, platformFeeCents: 200, status: 'confirmed', createdAt: at('2026-10-13T09:00:00'), organisationId: 'org-a', eventId: 'gig', retainedCents: null, processingCents: null },
  ],
  refunds: [{ amountCents: 1000, status: 'completed', at: at('2026-10-23T09:00:00') }],
}

describe('the week', () => {
  it('is the last whole Monday to Monday on the platform clock, beside the week before', () => {
    expect(last).toEqual({ from: at('2026-10-19T00:00:00'), to: at('2026-10-26T00:00:00'), monday: '2026-10-19' })
    expect(before.monday).toBe('2026-10-12')
    expect(before.to).toBe(last.from)
  })
})

describe('the five dimensions, last week', () => {
  const f = figuresFor(rows, last)

  it('relevance: listings live at the week end and published during it, seed data and drafts never', () => {
    expect(f.relevance).toEqual({ live: 2, published: 1 })
  })

  it('attention: distinct visitors and views inside the week, returning ones seen before it', () => {
    expect(f.attention).toEqual({ visitors: 3, returning: 1, views: 4 })
  })

  it('engagement: calendar adds, shares, follows, saves and confirmed subscribers inside the week', () => {
    expect(f.engagement).toEqual({ calendarAdds: 1, shares: 1, follows: 0, saves: 1, subscribers: 1 })
  })

  it('conversion: sold orders only, their value, and orders per 100 visitors', () => {
    expect(f.conversion).toEqual({ orders: 1, orderValueCents: 4500, ordersPer100Visitors: 33.3 })
  })

  it('business health: fee revenue, refunds completed, organisers who sold and how many had sold before', () => {
    expect(f.health).toEqual({ feeRevenueCents: 300, refundedCents: 1000, organisersSold: 1, organisersSoldBefore: 1, marginCents: 208, marginUnrecorded: 0, processingCents: 92 })
  })

  it('a week with no visitors gives no orders per 100 visitors rather than a zero', () => {
    expect(figuresFor({ ...rows, visits: [] }, last).conversion.ordersPer100Visitors).toBeNull()
  })
})

describe("Monday's learning loop", () => {
  it('names the city, category and channel with the most views last week', () => {
    expect(bestOfWeek(rows, last)).toEqual({
      city: { key: 'Geelong', views: 2 },
      category: { key: 'comedy', views: 2 },
      channel: { key: 'organic-social', views: 2 },
    })
  })
})

describe('the state scorecard', () => {
  it('reads recurring listings live in the state against 50, organisers with two or more listings, returning visitors and the margin', () => {
    const vic = new Set(['Geelong', 'Melbourne', 'Ballarat', 'Bendigo'])
    expect(stateScorecard(rows, last, before, vic)).toEqual({ recurringLive: 1, recurringTarget: 50, repeatOrganisers: 1, returningUp: true, marginPositive: true })
  })

  // The DemandOS audit, 30 October 2026: the retained fee is written once at charge time and a refund never rewrites
  // it, so a refunded order kept counting the fee the refund gave back. The fee comes back in the refund's share of
  // the order (refund.ts, a proportional fee refund); Stripe's processing is not returned, so it stays a cost.
  it('takes the refunded share of the kept fee off the margin, and leaves the processing cost on', () => {
    const paid = rows.orders[0]
    const refunded = { ...rows, orders: [{ ...paid, status: 'refunded', refundedCents: 4500 }] }
    expect(figuresFor(refunded, last).health.marginCents).toBe(300 - 92 - 300)
    const half = { ...rows, orders: [{ ...paid, status: 'partially_refunded', refundedCents: 2250 }] }
    expect(figuresFor(half, last).health.marginCents).toBe(300 - 92 - 150)
    const none = { ...rows, orders: [{ ...paid, refundedCents: 0 }] }
    expect(figuresFor(none, last).health.marginCents).toBe(208)
  })

  it("reads an order's refunded cents from its completed refunds only, numbers or numeric strings", () => {
    expect(refundedOf([{ amount_cents: 1000, status: 'completed' }, { amount_cents: '250', status: 'completed' }, { amount_cents: 999, status: 'failed' }])).toBe(1250)
    expect(refundedOf(null)).toBe(0)
    expect(refundedOf([])).toBe(0)
  })

  it('leaves an order that does not record what was kept out of the margin, and counts it', () => {
    const unrecorded = { ...rows, orders: rows.orders.map((o) => ({ ...o, retainedCents: null })) }
    expect(figuresFor(unrecorded, last).health).toMatchObject({ marginCents: 0, marginUnrecorded: 1, processingCents: 0 })
  })
})
