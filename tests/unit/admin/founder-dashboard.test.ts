import { describe, expect, it } from 'vitest'
import { arrangeDashboard, type DashboardSection } from '@/lib/admin/founder-dashboard-math'

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
