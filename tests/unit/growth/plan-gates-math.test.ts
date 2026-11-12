import { describe, expect, it } from 'vitest'
import { gateStanding, melbourneDay, PLAN_GATES, planGates, recurringOrganisations } from '@/lib/growth/plan-gates-math'

/*
 * THE MASTER PLAN'S GATES (the PM's 09:19 of 12 November 2026, item 3): 20 events selling through EventLinqs by 13 Dec;
 * 50 by 31 Jan; 30 recurring organisers and 300+ checked upcoming events by 31 Jan; 10 active, recurring, paid-event
 * organisers in Melbourne by end of March; outreach 20 a day.
 */
const NOW = new Date('2026-11-12T01:00:00Z') // 12:00 in Melbourne, 12 November

describe('the gates as the plan names them', () => {
  it('carries each target and day', () => {
    expect(PLAN_GATES.map((g) => [g.key, g.target, g.due])).toEqual([
      ['selling-20', 20, '2026-12-13'],
      ['selling-50', 50, '2027-01-31'],
      ['recurring-30', 30, '2027-01-31'],
      ['checked-300', 300, '2027-01-31'],
      ['melbourne-paid-10', 10, '2027-03-31'],
      ['outreach-20', 20, null],
    ])
  })
})

describe('recurring: paid orders in two or more months, Melbourne time', () => {
  it('counts an organisation once two months hold its paid orders', () => {
    const r = recurringOrganisations([
      { organisationId: 'a', confirmedAt: '2026-09-10T03:00:00Z' },
      { organisationId: 'a', confirmedAt: '2026-10-02T03:00:00Z' },
      { organisationId: 'b', confirmedAt: '2026-10-02T03:00:00Z' },
      { organisationId: 'b', confirmedAt: '2026-10-30T03:00:00Z' },
      { organisationId: null, confirmedAt: '2026-10-30T03:00:00Z' },
    ])
    expect([...r]).toEqual(['a'])
  })
  it('reads the month in Melbourne: 31 October 14:00 UTC is 1 November there', () => {
    expect(melbourneDay(new Date('2026-10-31T14:00:00Z'))).toBe('2026-11-01')
    const r = recurringOrganisations([
      { organisationId: 'c', confirmedAt: '2026-10-31T12:00:00Z' },
      { organisationId: 'c', confirmedAt: '2026-10-31T14:00:00Z' },
    ])
    expect(r.has('c')).toBe(true)
  })
})

describe('where a gate stands', () => {
  it('says what each week still needs, from today in Melbourne to its day', () => {
    const s = gateStanding(PLAN_GATES[0], 6, NOW)
    expect(s.daysLeft).toBe(31)
    expect(s.met).toBe(false)
    expect(s.perWeek).toBe(Math.ceil((14 / 31) * 7))
  })
  it('a met gate needs nothing; a gate past its day and short is late', () => {
    expect(gateStanding(PLAN_GATES[0], 20, NOW)).toMatchObject({ met: true, perWeek: null, late: false })
    expect(gateStanding(PLAN_GATES[0], 3, new Date('2026-12-20T01:00:00Z'))).toMatchObject({ met: false, late: true, perWeek: null })
  })
  it('the daily quota has no day and no weekly need', () => {
    const s = planGates({ selling: 0, recurring: 0, checked: 0, melbourne_paid: 0, outreach_today: 4 }, NOW).find((g) => g.gate.key === 'outreach-20')
    expect(s).toMatchObject({ value: 4, daysLeft: null, perWeek: null, met: false })
  })
})
