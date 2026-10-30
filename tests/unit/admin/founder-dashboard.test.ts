import { describe, expect, it } from 'vitest'
import { arrangeDashboard, byException, economicsFigures, kitsSentAndUsed, rhythm, type DashboardSection } from '@/lib/admin/founder-dashboard-math'

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

/**
 * THE FOUNDER DASHBOARD BY EXCEPTION (the supreme specification of 30 October 2026, section 28): "what the system
 * completed, what is scheduled, what failed, what requires approval, what generated measurable value, what needs
 * attention next". A figure not counted is kept apart and never put in a group as if it were 0.
 */
describe('byException', () => {
  const sections: DashboardSection[] = [
    section(
      'events',
      [
        { label: 'Awaiting a check', value: 3, asksForAPerson: true, href: '/admin/collected', kind: 'approve', cadence: 'daily' },
        { label: 'Verified upcoming', value: 280, asksForAPerson: false, href: null, kind: 'measure', cadence: 'weekly' },
      ],
      ['12 nights published this week'],
    ),
    section('organisers', [{ label: 'Submissions waiting', value: 7, asksForAPerson: true, href: '/admin/submissions', kind: 'approve', cadence: 'daily' }]),
    section(
      'marketing',
      [
        { label: 'Scheduled to post', value: 4, asksForAPerson: false, href: '/admin/social', kind: 'scheduled', cadence: 'daily' },
        { label: 'Pieces to approve', value: 0, asksForAPerson: true, href: '/admin/social', kind: 'approve', cadence: 'weekly' },
      ],
      ['2 pieces posted this week'],
    ),
    section('conversion', [
      { label: 'Presses out to booking sites, 7 days', value: 21, asksForAPerson: false, href: '/admin/growth', kind: 'value', cadence: 'weekly' },
      { label: 'Paid orders last week', value: 0, asksForAPerson: false, href: '/admin/growth', kind: 'value', cadence: 'weekly' },
    ]),
    section('operations', [
      { label: 'Health checks failing', value: 2, asksForAPerson: true, href: '/admin/health', kind: 'failed', cadence: 'daily' },
      { label: 'Messages that failed to send, 7 days', value: null, asksForAPerson: true, href: null, kind: 'failed', cadence: 'daily', note: 'could not be read: x' },
    ]),
  ]

  it('gives the six groups of section 28, each from the figures of its kind', () => {
    const v = byException(sections)
    expect(v.completed).toEqual(['12 nights published this week', '2 pieces posted this week'])
    expect(v.scheduled.map((f) => f.label)).toEqual(['Scheduled to post'])
    expect(v.failed.map((f) => f.label)).toEqual(['Health checks failing'])
    expect(v.needsApproval.map((f) => f.label)).toEqual(['Submissions waiting', 'Awaiting a check'])
    expect(v.value.map((f) => f.label)).toEqual(['Presses out to booking sites, 7 days'])
  })

  it('puts a failure before an approval in what needs attention next, the largest first within each', () => {
    expect(byException(sections).next?.label).toBe('Health checks failing')
    const noFailure = sections.filter((s) => s.key !== 'operations')
    expect(byException(noFailure).next?.label).toBe('Submissions waiting')
  })

  it('keeps a figure that could not be counted apart, never in a group as 0', () => {
    const v = byException(sections)
    expect(v.failed.some((f) => f.value === null)).toBe(false)
    expect(v.notCounted.map((f) => f.label)).toEqual(['Messages that failed to send, 7 days'])
  })

  it('says nothing needs attention when nothing failed and nothing waits', () => {
    const quiet = [section('events', [{ label: 'Verified upcoming', value: 280, asksForAPerson: false, href: null, kind: 'measure', cadence: 'weekly' }])]
    const v = byException(quiet)
    expect(v.next).toBeNull()
    expect(v.failed).toEqual([])
    expect(v.needsApproval).toEqual([])
  })
})

/**
 * THE OPERATING RHYTHM (the supreme specification, section 29): daily (event accuracy, organiser responses, failed
 * jobs, upcoming campaigns, ticketing issues), weekly (approvals, acquisition, supply, conversion), monthly (organiser
 * retention, ticketing contribution, acquisition costs, cash flow, expansion readiness). Each figure once, in its
 * cadence, in the order the sections give it.
 */
describe('rhythm', () => {
  it('groups every figure by its cadence, each once', () => {
    const r = rhythm([
      section('events', [
        { label: 'Expiring in 7 days', value: 1, asksForAPerson: true, href: null, kind: 'approve', cadence: 'daily' },
        { label: 'Verified upcoming', value: 280, asksForAPerson: false, href: null, kind: 'measure', cadence: 'weekly' },
      ]),
      section('economics', [
        { label: 'Contribution, last 28 days', value: 0, asksForAPerson: false, href: null, kind: 'value', cadence: 'monthly' },
        { label: 'Cash flow', value: null, asksForAPerson: false, href: null, kind: 'measure', cadence: 'monthly', note: 'not counted' },
      ]),
    ])
    expect(r.daily.map((f) => f.label)).toEqual(['Expiring in 7 days'])
    expect(r.weekly.map((f) => f.label)).toEqual(['Verified upcoming'])
    expect(r.monthly.map((f) => f.label)).toEqual(['Contribution, last 28 days', 'Cash flow'])
  })

  it('puts a figure with no cadence in the weekly view, where the growth week reads', () => {
    const r = rhythm([section('events', [{ label: 'Untagged', value: 1, asksForAPerson: false, href: null }])])
    expect(r.weekly.map((f) => f.label)).toEqual(['Untagged'])
  })
})
