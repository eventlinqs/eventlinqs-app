import { describe, expect, it } from 'vitest'
import { arrangeDashboard, economicsFigures, kitsSentAndUsed, type DashboardSection } from '@/lib/admin/founder-dashboard-math'

/**
 * The founder dashboard of the master mandate of 29 October 2026, section 14: events, organisers, marketing, revenue and
 * conversion, operations; "prioritise actionable exceptions ... tell the founder what requires attention and what the
 * system has already completed". A figure needs attention when it is counted and above zero and is one that asks for a
 * person; a section with any comes first; a figure not counted is said so, never shown as 0 and never flagged.
 */

const section = (key: DashboardSection['key'], figures: DashboardSection['figures'], done: string[] = []): DashboardSection => ({
  key,
  title: key,
  figures,
  done,
})

describe('arrangeDashboard', () => {
  it('puts the sections that need a person first, keeping the rest in their order', () => {
    const a = arrangeDashboard([
      section('events', [{ label: 'Verified upcoming', value: 280, asksForAPerson: false, href: null }]),
      section('organisers', [{ label: 'Submissions waiting', value: 2, asksForAPerson: true, href: '/admin/submissions' }]),
      section('marketing', [{ label: 'Pieces to approve', value: 0, asksForAPerson: true, href: '/admin/social' }]),
      section('operations', [{ label: 'Posts held', value: 1, asksForAPerson: true, href: '/admin/social' }]),
    ])
    expect(a.map((s) => s.key)).toEqual(['organisers', 'operations', 'events', 'marketing'])
    expect(a.map((s) => s.needsYou)).toEqual([1, 1, 0, 0])
  })

  it('puts a section\'s figures that need a person before its other figures', () => {
    const [s] = arrangeDashboard([
      section('events', [
        { label: 'Verified upcoming', value: 280, asksForAPerson: false, href: null },
        { label: 'Expiring in 7 days', value: 4, asksForAPerson: true, href: '/admin/collected' },
        { label: 'Awaiting a check', value: 0, asksForAPerson: true, href: '/admin/collected' },
      ]),
    ])
    expect(s.figures.map((f) => [f.label, f.attention])).toEqual([
      ['Expiring in 7 days', true],
      ['Verified upcoming', false],
      ['Awaiting a check', false],
    ])
  })

  it('never flags a figure it could not count, and keeps it as not counted', () => {
    const [s] = arrangeDashboard([section('operations', [{ label: 'Failed sends', value: null, asksForAPerson: true, href: null, note: 'its table is not on this database' }])])
    expect(s.figures[0]).toMatchObject({ value: null, attention: false })
    expect(s.needsYou).toBe(0)
  })

  it('keeps what the system has already done with its section', () => {
    const [s] = arrangeDashboard([section('events', [], ['43 nights listed from their sources this week'])])
    expect(s.done).toEqual(['43 nights listed from their sources this week'])
  })
})

/**
 * The growth blueprint of 30 October 2026, section 4D ("a partner kit sent is not a partner kit used; that distinction
 * belongs in the dashboard") and the PM's 01:23 build map: a kit is used when its own link was tapped by a real person
 * (QA presses already left out by the reader) within the credit window from when it was sent.
 */
describe('kitsSentAndUsed', () => {
  const now = new Date('2026-10-30T00:00:00Z')
  it('counts kits sent in the window and, of those, the ones whose own link was tapped after they went', () => {
    const r = kitsSentAndUsed(
      [
        { sentAt: '2026-10-20T00:00:00Z', linkId: 'a' },
        { sentAt: '2026-10-21T00:00:00Z', linkId: 'b' },
        { sentAt: '2026-10-22T00:00:00Z', linkId: null },
        { sentAt: null, linkId: 'c' },
        { sentAt: '2026-08-01T00:00:00Z', linkId: 'd' },
      ],
      [
        { linkId: 'a', at: '2026-10-25T00:00:00Z' },
        { linkId: 'a', at: '2026-10-26T00:00:00Z' },
        { linkId: 'b', at: '2026-10-20T00:00:00Z' },
        { linkId: 'c', at: '2026-10-25T00:00:00Z' },
        { linkId: 'd', at: '2026-10-25T00:00:00Z' },
      ],
      now,
    )
    expect(r).toEqual({ sent: 3, used: 1, withoutALink: 1 })
  })

  it('says nothing was used when nothing was sent', () => {
    expect(kitsSentAndUsed([], [], now)).toEqual({ sent: 0, used: 0, withoutALink: 0 })
  })
})

/**
 * The PM's rulings of 30 October 2026, ruling 6 (economics, honest): gross ticket sales, platform fee earned, payment
 * cost, contribution, and break-even volume at the current fee, with external referrals never revenue. Break-even
 * needs a monthly fixed cost the platform does not hold, so it is not counted rather than assumed.
 */
describe('economicsFigures', () => {
  it('reads the week\'s sold orders into the five figures, break-even not counted without a fixed cost', () => {
    const f = economicsFigures({ orderValueCents: 4500, feeRevenueCents: 300, processingCents: 92, marginCents: 208, marginUnrecorded: 0 })
    expect(f.map((x) => [x.label, x.value, x.display ?? null])).toEqual([
      ['Gross ticket sales last week', 4500, '$45.00'],
      ['Platform fee earned last week', 300, '$3.00'],
      ['Payment cost last week', 92, '$0.92'],
      ['Contribution last week', 208, '$2.08'],
      ['Break-even volume', null, null],
    ])
    expect(f[4].note).toBe('no monthly fixed cost is recorded, so none is assumed')
    expect(f.every((x) => !x.asksForAPerson)).toBe(true)
  })

  it('says how many orders left out of the cost and contribution do not record both', () => {
    const f = economicsFigures({ orderValueCents: 4500, feeRevenueCents: 300, processingCents: 0, marginCents: 0, marginUnrecorded: 2 })
    expect(f[2].note).toBe('2 orders do not record it and are left out')
    expect(f[3].note).toBe('2 orders do not record it and are left out')
  })
})
