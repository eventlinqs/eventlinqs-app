import { describe, expect, it } from 'vitest'
import { eventsPerActiveOrganiser, FUNNEL_STAGES, funnelOf, monthOf, monthsEndingAt, type StageCounts } from '@/lib/growth/organiser-funnel-math'

/**
 * The organiser funnel and events per active organiser per month (the engine plan of 28 October 2026, part H). A stage
 * whose source has not landed is not counted, never 0; a month with nobody active has no figure.
 */

const counts = (over: Partial<Record<(typeof FUNNEL_STAGES)[number], number | null>>): StageCounts =>
  ({ found: 120, qualified: 100, invited: 80, claimed: 20, yes: 15, photos: 6, publishing: 14, reported: 9, ...over }) as StageCounts

describe('funnelOf', () => {
  it('walks the journey in order, each step a share of the one before', () => {
    const steps = funnelOf(counts({}))
    expect(steps.map((s) => s.stage)).toEqual([...FUNNEL_STAGES])
    expect(steps[0].fromBefore).toBeNull()
    expect(steps[1].fromBefore).toBeCloseTo(100 / 120)
    expect(steps[3].fromBefore).toBeCloseTo(20 / 80)
  })

  it('never shows a stage whose source has not landed as 0, and gives no rate into or out of it', () => {
    const steps = funnelOf(counts({ qualified: null, invited: null }))
    expect(steps[1].organisers).toBeNull()
    expect(steps[1].fromBefore).toBeNull()
    expect(steps[2].fromBefore).toBeNull()
    expect(steps[3].fromBefore).toBeNull()
  })

  it('gives no rate out of a stage with nobody in it', () => {
    expect(funnelOf(counts({ claimed: 0, yes: 0 }))[4].fromBefore).toBeNull()
  })
})

describe('eventsPerActiveOrganiser', () => {
  const ZONE = 'Australia/Sydney'
  const nights = [
    { organiser: 'a', startDate: '2026-10-03T09:00:00Z', isPublic: true },
    { organiser: 'a', startDate: '2026-10-10T09:00:00Z', isPublic: true },
    { organiser: 'b', startDate: '2026-10-17T09:00:00Z', isPublic: true },
    { organiser: 'b', startDate: '2026-10-24T09:00:00Z', isPublic: false },
    // 14:00 UTC on 31 October is 1 am on 1 November in Melbourne.
    { organiser: 'c', startDate: '2026-10-31T14:00:00Z', isPublic: true },
  ]

  it('counts public nights over the organisers active in each Melbourne month', () => {
    expect(eventsPerActiveOrganiser(nights, ['2026-11', '2026-10'], ZONE)).toEqual([
      { month: '2026-10', activeOrganisers: 2, nights: 3, perActive: 1.5 },
      { month: '2026-11', activeOrganisers: 1, nights: 1, perActive: 1 },
    ])
  })

  it('gives a month with nobody active no figure, never 0', () => {
    expect(eventsPerActiveOrganiser(nights, ['2026-12'], ZONE)).toEqual([{ month: '2026-12', activeOrganisers: 0, nights: 0, perActive: null }])
  })

  it('reads the month in Melbourne, not UTC', () => {
    expect(monthOf('2026-10-31T14:00:00Z', ZONE)).toBe('2026-11')
  })
})

describe('monthsEndingAt', () => {
  it('lists the months ending at the one given, oldest first, across a year boundary', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthsEndingAt('2026-01', 1)).toEqual(['2026-01'])
    expect(monthsEndingAt('2026-12', 2)).toEqual(['2026-11', '2026-12'])
  })

  it('refuses a month that is not YYYY-MM', () => {
    expect(() => monthsEndingAt('2026-1', 2)).toThrow()
    expect(() => monthsEndingAt('2026-13', 2)).toThrow()
  })
})
