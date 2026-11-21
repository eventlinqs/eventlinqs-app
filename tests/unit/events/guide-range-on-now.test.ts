import { describe, expect, it } from 'vitest'
import { inRange, type GuideDays } from '@/lib/events/guide-sections'

/*
 * A NIGHT THAT IS ON NOW IS IN TODAY'S RANGES (WINDOW 5C, 21 November 2026, 15:38, on production at 390 and 1440): the
 * Melbourne guide's search for 'AMCF' found nothing, because the festival began on 20 November and every dated range
 * judged a row by its first day alone; on its second day it fell out of Today, This week, This month and Next 3 months
 * while it was still on ('Next 3 months: 0 events'). Law 16: a published night that has not ended is findable on its
 * city guide until it ends. A row whose first day is past and whose `until` is still ahead counts as today's.
 */
const days: GuideDays = { todayKey: '2026-11-21', weekendKeys: ['2026-11-20', '2026-11-21', '2026-11-22'], weekKeys: ['2026-11-21', '2026-11-22', '2026-11-23'] }
const now = Date.parse('2026-11-21T04:30:00Z')
const festival = { dayKey: '2026-11-20', until: Date.parse('2026-11-22T09:00:00Z') }
const ended = { dayKey: '2026-11-20', until: Date.parse('2026-11-21T01:00:00Z') }
const later = { dayKey: '2026-12-05', until: Date.parse('2026-12-05T13:00:00Z') }

describe('a night that is on now', () => {
  it('is in today, this week, this month and the next three months', () => {
    for (const range of ['today', 'week', 'month', 'three'] as const) expect(inRange(festival, range, days, '', now), range).toBe(true)
  })

  it('is in a picked date of today, and in this weekend', () => {
    expect(inRange(festival, 'date', days, '2026-11-21', now)).toBe(true)
    expect(inRange(festival, 'weekend', days, '', now)).toBe(true)
  })

  it('is not in today once it has ended', () => {
    for (const range of ['today', 'week', 'month', 'three'] as const) expect(inRange(ended, range, days, '', now), range).toBe(false)
  })

  it('leaves a night that has not begun on its own day, as before', () => {
    expect(inRange(later, 'today', days, '', now)).toBe(false)
    expect(inRange(later, 'three', days, '', now)).toBe(true)
    expect(inRange(later, 'date', days, '2026-12-05', now)).toBe(true)
  })

  it('reads a row with no until as its first day alone, as before', () => {
    expect(inRange({ dayKey: '2026-11-20' }, 'three', days, '', now)).toBe(false)
  })
})
