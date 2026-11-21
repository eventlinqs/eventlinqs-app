import { describe, expect, it } from 'vitest'
import { planAsOf } from '@/lib/social/plan-for'

/*
 * THE PLAN FOR TOMORROW, DRAWN TODAY (the PM's 17:42 of 21 November 2026: Sunday's AMCF post drawn, looked at, dry run
 * and scheduled the evening before). Asked for tomorrow, the planner plans as of tomorrow's 05:00 in Melbourne, across a
 * daylight saving change too; anything else plans as now.
 */
describe('planAsOf', () => {
  it("Saturday evening, for tomorrow: Sunday 22 November 2026 at 05:00 in Melbourne (UTC+11)", () => {
    expect(planAsOf({ for: 'tomorrow' }, new Date('2026-11-21T07:20:00Z')).toISOString()).toBe('2026-11-21T18:00:00.000Z')
  })

  it('across the April change (Saturday 3 April 2027, clocks back on Sunday 4 April): Sunday 05:00 is UTC+10', () => {
    expect(planAsOf({ for: 'tomorrow' }, new Date('2027-04-03T08:00:00Z')).toISOString()).toBe('2027-04-03T19:00:00.000Z')
  })

  it('today, or anything else, plans as now', () => {
    const now = new Date('2026-11-21T07:20:00Z')
    expect(planAsOf({ for: 'today' }, now)).toBe(now)
    expect(planAsOf({ for: null }, now)).toBe(now)
    expect(planAsOf({ for: 'next-week' }, now)).toBe(now)
  })
})
