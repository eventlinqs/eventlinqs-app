import { describe, expect, it } from 'vitest'
import { draftWeek, RHYTHM, type CalendarEvent } from '@/lib/growth/editorial-calendar-math'
import { GUIDE_CATEGORIES } from '@/lib/categories/classify'

/**
 * ONE EDITORIAL CALENDAR PER CITY (C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s5 and its rhythm table; the accepted
 * plan C:\dev\GROWTH\growth-30-day-schedule.md (b) 3, owner WINDOW 2). A week of seven slots in the directive's Monday
 * to Sunday rhythm, drafted from VERIFIED events only: never an ended, cancelled, private or other-city event; an empty
 * slot says so and is never filled; every slot is a draft until a person approves it.
 */

const ZONE = 'Australia/Melbourne'
let n = 0
const ev = (o: Partial<CalendarEvent> & { startsAt: string }): CalendarEvent => ({
  id: `e${++n}`,
  title: `Bp Night ${n}`,
  endsAt: null,
  status: 'published',
  visibility: 'public',
  cityRelation: 'city',
  category: 'music',
  venueName: 'Bp Hall',
  suburb: 'Geelong',
  organiserId: 'org-a',
  organiserName: 'Bp Organiser A',
  hasAuthorisedMedia: false,
  ...o,
})

// Week of Monday 2 November 2026 (AEDT, UTC+11). Local 19:30 on a day is 08:30Z that day.
const at = (day: number, hhmm = '19:30') => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h - 11, m)).toISOString()
}
const NOW = new Date('2026-11-01T22:00:00Z') // Monday 2 Nov, 9am in Melbourne

describe('the week', () => {
  it("is the directive's seven slots, Monday to Sunday, each with its date and theme, all drafts", () => {
    const week = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [], now: NOW })
    expect(week.map((s) => [s.day, s.date])).toEqual([
      ['mon', '2026-11-02'], ['tue', '2026-11-03'], ['wed', '2026-11-04'], ['thu', '2026-11-05'],
      ['fri', '2026-11-06'], ['sat', '2026-11-07'], ['sun', '2026-11-08'],
    ])
    expect(week.map((s) => s.theme)).toEqual(RHYTHM.map((r) => r.theme))
    expect(RHYTHM.map((r) => r.theme)).toEqual([
      "This week's events",
      'Live music, nightlife and comedy',
      'Weekend planning guide',
      'Five worthwhile things happening this weekend',
      'Tonight and tomorrow',
      'Real event coverage and community highlights',
      "Next week's preview and organiser spotlight",
    ])
    expect(week.every((s) => s.status === 'draft')).toBe(true)
  })

  it('a weekStart that is not a Monday is refused', () => {
    expect(() => draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-03', events: [], now: NOW })).toThrow(/Monday/)
  })
})

describe('only verified events of this city', () => {
  it('never an ended, cancelled, postponed, private, unpublished or other-city event', () => {
    const ok = ev({ startsAt: at(4), title: 'Bp Kept' })
    const events = [
      ok,
      ev({ startsAt: at(4), status: 'cancelled' }),
      ev({ startsAt: at(4), status: 'postponed' }),
      ev({ startsAt: at(4), status: 'draft' }),
      ev({ startsAt: at(4), visibility: 'private' }),
      ev({ startsAt: at(4), cityRelation: 'surrounding' }),
      ev({ startsAt: at(4), cityRelation: 'unplaced' }),
    ]
    const mon = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events, now: NOW })[0]
    expect(mon.picks.map((p) => p.id)).toEqual([ok.id])
    expect(mon.total).toBe(1)
  })

  it('an event already over on the slot day is not in that slot; a later slot never holds an earlier night', () => {
    const tuesday = ev({ startsAt: at(3), title: 'Bp Tuesday' })
    const saturday = ev({ startsAt: at(7), title: 'Bp Saturday' })
    const week = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [tuesday, saturday], now: NOW })
    const wed = week[2]
    expect(wed.picks.map((p) => p.id)).toEqual([saturday.id])
    const mon = week[0]
    expect(mon.picks.map((p) => p.id)).toEqual([tuesday.id, saturday.id])
  })

  it('a night at 11.30 pm Saturday is Saturday on the city clock, not Sunday in UTC terms or Friday', () => {
    const late = ev({ startsAt: at(7, '23:30') })
    const fri = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [late], now: NOW })[4]
    expect(fri.picks.map((p) => p.id)).toEqual([late.id])
    expect(fri.windowFrom).toBe('2026-11-06')
    expect(fri.windowTo).toBe('2026-11-07')
  })
})

describe('each slot by its rule', () => {
  it('Tuesday holds only music, nightlife and comedy, Tuesday to Sunday', () => {
    const music = ev({ startsAt: at(5), category: 'music' })
    const comedy = ev({ startsAt: at(6), category: 'comedy' })
    const club = ev({ startsAt: at(7), category: 'nightlife' })
    const market = ev({ startsAt: at(7, '09:00'), category: 'food-drink' })
    const monday = ev({ startsAt: at(2), category: 'music' })
    const tue = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [music, comedy, club, market, monday], now: NOW })[1]
    expect(tue.picks.map((p) => p.id)).toEqual([music.id, comedy.id, club.id])
  })

  it('Thursday is at most five, one of each kind first, earliest first', () => {
    const events = [
      ev({ startsAt: at(7, '08:00'), category: 'music' }),
      ev({ startsAt: at(7, '09:00'), category: 'music' }),
      ev({ startsAt: at(7, '09:30'), category: 'music' }),
      ev({ startsAt: at(7, '10:00'), category: 'family' }),
      ev({ startsAt: at(7, '20:00'), category: 'comedy' }),
      ev({ startsAt: at(8, '09:00'), category: 'food-drink' }),
      ev({ startsAt: at(8, '11:00'), category: 'sports' }),
      ev({ startsAt: at(8, '14:00'), category: 'arts-community' }),
    ]
    const thu = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events, now: NOW })[3]
    expect(thu.picks).toHaveLength(5)
    expect(new Set(thu.picks.map((p) => p.category)).size).toBe(5)
    expect(thu.total).toBe(8)
    expect(thu.picks[0].id).toBe(events[0].id)
  })

  it("'this weekend' is the platform's one weekend, Saturday and Sunday: a Friday night is in Friday's slot, never Thursday's five", () => {
    const friday = ev({ startsAt: at(6, '20:00'), category: 'music' })
    const saturday = ev({ startsAt: at(7, '20:00'), category: 'comedy' })
    const week = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [friday, saturday], now: NOW })
    expect(week[2].picks.map((p) => p.id)).toEqual([saturday.id])
    expect(week[3].picks.map((p) => p.id)).toEqual([saturday.id])
    expect([week[3].windowFrom, week[3].windowTo]).toEqual(['2026-11-07', '2026-11-08'])
    expect(week[4].picks.map((p) => p.id)).toEqual([friday.id, saturday.id])
  })

  it('Saturday names coverage honestly: a night with authorised media can be covered, none is invented', () => {
    const withMedia = ev({ startsAt: at(7, '12:00'), category: 'community', hasAuthorisedMedia: true })
    const without = ev({ startsAt: at(7, '14:00'), category: 'festival' })
    const sat = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [withMedia, without], now: NOW })[5]
    expect(sat.picks.map((p) => p.id)).toEqual([withMedia.id, without.id])
    expect(sat.coverageReady.map((p) => p.id)).toEqual([withMedia.id])
  })

  it("Sunday previews NEXT week and spotlights the organiser with the most verified nights in it", () => {
    const thisWeek = ev({ startsAt: at(5), organiserId: 'org-a' })
    const b1 = ev({ startsAt: at(10), organiserId: 'org-b', organiserName: 'Bp Organiser B' })
    const b2 = ev({ startsAt: at(12), organiserId: 'org-b', organiserName: 'Bp Organiser B' })
    const a1 = ev({ startsAt: at(11), organiserId: 'org-a' })
    const sun = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [thisWeek, b1, b2, a1], now: NOW })[6]
    expect(sun.windowFrom).toBe('2026-11-09')
    expect(sun.windowTo).toBe('2026-11-15')
    expect(sun.picks.map((p) => p.id)).toEqual([b1.id, a1.id, b2.id])
    expect(sun.spotlight).toEqual({ organiserId: 'org-b', organiserName: 'Bp Organiser B', nights: 2 })
  })
})

describe('the slots speak the guide categories (law 13: the new system supersedes the old)', () => {
  it('every category a slot names is one of the 15 guide categories, and Saturday holds markets', () => {
    for (const r of RHYTHM) {
      for (const c of r.categories ?? []) expect(GUIDE_CATEGORIES as readonly string[]).toContain(c)
    }
    const market = ev({ startsAt: at(7, '09:00'), category: 'markets' })
    const sat = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [market], now: NOW })[5]
    expect(sat.picks.map((p) => p.id)).toEqual([market.id])
  })
})

describe('an empty slot says so, never filler', () => {
  it('names what is missing and holds nothing', () => {
    const week = draftWeek({ city: 'geelong', cityName: 'Geelong', zone: ZONE, weekStart: '2026-11-02', events: [ev({ startsAt: at(3), category: 'family' })], now: NOW })
    const tue = week[1]
    expect(tue.picks).toEqual([])
    expect(tue.empty).toBe('No verified live music, nightlife or comedy in Geelong from Tue, 3 Nov to Sun, 8 Nov.')
    expect(week[6].spotlight).toBeNull()
    expect(week[6].empty).toMatch(/^No verified events in Geelong from Mon, 9 Nov to Sun, 15 Nov\.$/)
  })
})
