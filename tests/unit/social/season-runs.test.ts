import { describe, expect, it } from 'vitest'
import { momentsDue, runsOf, stageOf, type LifecycleNight, type RunHistory } from '@/lib/social/lifecycle'

/*
 * A SEASON IS ONE RUN (WINDOW 5A, 22 November 2026). The listings engine gives every dated night its own one-off series,
 * so Colours of Asia: Garden of Wonders (Asia Oasis), listed one event a night on 20, 21 and 22 November, was three
 * one-day runs, and its last night posted 'Opening today.' (Instagram DgAm9hpkYBN, read back that night). Nights now join
 * by a shared series or by the same title at the same venue; the keys their moments were drawn under before stay aliases.
 */
const night = (over: Partial<LifecycleNight> = {}): LifecycleNight => ({
  eventId: 'e1',
  seriesId: null,
  title: 'Colours of Asia: Garden of Wonders',
  venueKey: 'alexandra-gardens',
  startDate: '2026-11-20T00:00:00Z',
  endDate: '2026-11-20T11:00:00Z',
  timezone: 'Australia/Melbourne',
  listedAt: '2026-11-01T00:00:00Z',
  cancelled: false,
  salesOpen: true,
  ticketedHere: false,
  tier: 2,
  ...over,
})
const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
const melb = (day: string) => new Date(`${day}T01:00:00Z`) // noon in Melbourne
const colours = ['13', '14', '15', '20', '21', '22'].map((d, i) =>
  night({ eventId: `c${d}`, seriesId: `one-off-${i}`, startDate: `2026-11-${d}T00:00:00Z`, endDate: `2026-11-${d}T11:00:00Z` }),
)

describe('a festival listed one dated event a night is one season', () => {
  it("Colours of Asia's six one-off listings are two seasons, each its own days", () => {
    const runs = runsOf(colours)
    expect(runs.map((r) => r.days)).toEqual([
      ['2026-11-13', '2026-11-14', '2026-11-15'],
      ['2026-11-20', '2026-11-21', '2026-11-22'],
    ])
  })

  it('its last night is its final day, its later weekend never an opening, its first weekend never a final day', () => {
    const [first, second] = runsOf(colours)
    expect([first.continuesSeason, first.seasonGoesOn, second.continuesSeason, second.seasonGoesOn]).toEqual([undefined, true, true, undefined])
    expect(stageOf(second, melb('2026-11-22'))).toBe('final_day')
    expect(momentsDue(second, melb('2026-11-22'), none).map((m) => `${m.kind} ${m.format}`).sort()).toEqual(['final_day feed', 'final_day story'])
    expect(stageOf(second, melb('2026-11-20'))).toBe('running')
    expect(stageOf(second, melb('2026-11-21'))).toBe('running')
    expect(stageOf(first, melb('2026-11-13'))).toBe('first_day')
    expect(stageOf(first, melb('2026-11-15'))).toBe('running')
  })

  it("the keys its nights' moments were drawn under before stay aliases, so nothing had is drawn twice", () => {
    const second = runsOf(colours)[1]
    expect(second.key).toBe('t:colours of asia garden of wonders|alexandra-gardens|2026-11-20')
    expect(second.aliases).toEqual(['s:one-off-3|2026-11-20', 's:one-off-4|2026-11-21', 's:one-off-5|2026-11-22'])
  })

  it('a run of one series keeps its series key and has no alias; nights with no series keep the title key', () => {
    const series = runsOf(['20', '21'].map((d) => night({ eventId: `s${d}`, seriesId: 'real-series', startDate: `2026-11-${d}T00:00:00Z`, endDate: `2026-11-${d}T11:00:00Z` })))
    expect(series.map((r) => [r.key, r.aliases])).toEqual([['s:real-series|2026-11-20', undefined]])
    const plain = runsOf([night({ eventId: 'p1' })])
    expect(plain.map((r) => [r.key, r.aliases])).toEqual([['t:colours of asia garden of wonders|alexandra-gardens|2026-11-20', undefined]])
  })

  it('a different title at the same venue, or the same title elsewhere, stays its own run', () => {
    const runs = runsOf([night({ eventId: 'a' }), night({ eventId: 'b', title: 'Lantern Walk' }), night({ eventId: 'c', venueKey: 'fed-square' })])
    expect(runs).toHaveLength(3)
  })
})
