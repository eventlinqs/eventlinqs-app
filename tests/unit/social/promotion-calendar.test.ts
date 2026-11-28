import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { firstExposureGate, momentsDue, runsOf, seasonDaysOf, type LifecycleNight, type RunHistory } from '@/lib/social/lifecycle'
import { classifyEvent, exclusionOf, newestLeads, stageDays, type LeadRow } from '@/lib/social/promotion-calendar'

/*
 * THE PROMOTION CALENDAR (the PM's 15:58 and 16:05 of 27 November 2026, car O; the social operating model of 27
 * November, version 2, section 1; migration 20261128060001). Red on main, where the engine drew every piece on its own
 * day with uniform constants, had no type, no lead times, no late listing rule and posted a first feed on an event's own
 * day: each event now gets its type from its own fields, its stage days from promotion_lead_times (the newest version,
 * never a constant), the late listing and under 24 hours rules, its exclusions, and the planner never makes an event's
 * first exposure on its day unless a verified late breaking exception is flagged.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const base = { category: null, isFree: false, capacity: null, seriesRule: null, isRecurring: false, startDate: '2026-12-20T09:00:00Z', endDate: '2026-12-20T13:00:00Z' }

const L = (eventType: LeadRow['eventType'], stage: LeadRow['stage'], daysBefore: number | null, rule: string | null = null, storyOnly = false, version = 1): LeadRow => ({ eventType, stage, daysBefore, rule, storyOnly, version })
const LEADS = newestLeads([
  L('theatre', 'initial', 21), L('theatre', 'follow_up', 10), L('theatre', 'final', 2),
  L('comedy_nightlife', 'initial', 10), L('comedy_nightlife', 'follow_up', 4), L('comedy_nightlife', 'final', 0, null, true),
  L('recurring', 'initial', null, 'fortnightly_discovery'), L('recurring', 'follow_up', null, 'weekend_preview'), L('recurring', 'final', null, 'event_day', true),
  L('theatre', 'initial', 24, null, false, 2),
])

describe("the type, from the event's own fields", () => {
  it('reads section 1 in order: recurring, season, free, major, theatre, comedy and nightlife, sport, community', () => {
    expect(classifyEvent({ ...base, seriesRule: 'weekly', category: 'comedy' })).toEqual({ type: 'recurring', basis: 'series rule weekly' })
    expect(classifyEvent({ ...base, startDate: '2026-12-01T00:00:00Z', endDate: '2027-01-15T00:00:00Z' }).type).toBe('season')
    expect(classifyEvent({ ...base, isFree: true, category: 'music' }).type).toBe('free_local')
    expect(classifyEvent({ ...base, category: 'festival' }).type).toBe('major')
    expect(classifyEvent({ ...base, category: 'music', capacity: 12000 })).toEqual({ type: 'major', basis: 'music at a venue of 12000' })
    expect(classifyEvent({ ...base, category: 'music', capacity: 1500 }).type).toBe('theatre')
    expect(classifyEvent({ ...base, category: 'music', capacity: 300 }).type).toBe('comedy_nightlife')
    expect(classifyEvent({ ...base, category: 'theatre' }).type).toBe('theatre')
    expect(classifyEvent({ ...base, category: 'sports' }).type).toBe('sport')
    expect(classifyEvent({ ...base, category: 'family' })).toEqual({ type: 'community', basis: 'category family' })
  })
})

describe('the stage days, from the newest lead times', () => {
  it('counts back from the event in Melbourne by the newest version, never a constant', () => {
    const s = stageDays({ startDate: '2026-12-20T09:00:00Z', endDate: null, createdAt: '2026-11-01T00:00:00Z', type: 'theatre' }, LEADS)
    expect(s.map((x) => `${x.stage} ${x.dueOn} v${x.version}`)).toEqual(['initial 2026-11-26 v2', 'follow_up 2026-12-10 v1', 'final 2026-12-18 v1'])
  })
  it('a late listing enters the day after it was listed and follows the stages still ahead', () => {
    const s = stageDays({ startDate: '2026-12-20T09:00:00Z', endDate: null, createdAt: '2026-12-05T02:00:00Z', type: 'theatre' }, LEADS)
    expect(s).toEqual([
      { stage: 'initial', dueOn: '2026-12-06', storyOnly: false, lateListing: true, version: 2 },
      { stage: 'follow_up', dueOn: '2026-12-10', storyOnly: false, lateListing: false, version: 1 },
      { stage: 'final', dueOn: '2026-12-18', storyOnly: false, lateListing: false, version: 1 },
    ])
  })
  it('listed under 24 hours before: no feed stage, only the story its type has on its day', () => {
    const s = stageDays({ startDate: '2026-12-20T09:00:00Z', endDate: null, createdAt: '2026-12-20T00:00:00Z', type: 'comedy_nightlife' }, LEADS)
    expect(s.map((x) => `${x.stage} ${x.dueOn} ${x.storyOnly ? 'story' : 'feed'}`)).toEqual(['final 2026-12-20 story'])
    expect(stageDays({ startDate: '2026-12-20T09:00:00Z', endDate: null, createdAt: '2026-12-20T00:00:00Z', type: 'theatre' }, LEADS)).toEqual([])
  })
  it('a recurring Saturday night: weekly discovery a week ahead, the Wednesday preview, a story on the night', () => {
    const s = stageDays({ startDate: '2026-12-19T09:00:00Z', endDate: null, createdAt: '2026-11-01T00:00:00Z', type: 'recurring' }, LEADS)
    expect(s.map((x) => `${x.stage} ${x.dueOn}`)).toEqual(['initial 2026-12-12', 'follow_up 2026-12-16', 'final 2026-12-19'])
  })
})

describe('the exclusions', () => {
  it('a cancelled, postponed, ended or sold out event gets no promotion, each with its reason', () => {
    expect(exclusionOf({ status: 'cancelled', soldOut: false, ended: false })).toBe('it is cancelled')
    expect(exclusionOf({ status: 'postponed', soldOut: false, ended: false })).toBe('it is postponed')
    expect(exclusionOf({ status: 'published', soldOut: false, ended: true })).toBe('it has ended')
    expect(exclusionOf({ status: 'published', soldOut: true, ended: false })).toBe('it is sold out')
    expect(exclusionOf({ status: 'published', soldOut: false, ended: false })).toBeNull()
  })
})

const night = (over: Partial<LifecycleNight> = {}): LifecycleNight => ({
  eventId: 'e1', seriesId: null, title: 'Night Market', venueKey: 'v1', startDate: '2026-11-28T08:00:00Z', endDate: '2026-11-28T12:00:00Z',
  timezone: 'Australia/Melbourne', listedAt: '2026-11-01T00:00:00Z', cancelled: false, salesOpen: true, ticketedHere: false, tier: 2, ...over,
})
const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
const melb = (day: string) => new Date(`${day}T01:00:00Z`)

describe("never a first exposure on the event's own day", () => {
  const one = runsOf([night()])[0]
  const due = momentsDue(one, melb('2026-11-28'), none)
  it('an event never shown before gets nothing on its day', () => {
    expect(due.length).toBeGreaterThan(0)
    expect(firstExposureGate(one, melb('2026-11-28'), due, none, [], false)).toEqual([])
  })
  it('an event shown before keeps its day; a flagged late breaking exception may be covered on its day', () => {
    expect(firstExposureGate(one, melb('2026-11-28'), due, { ...none, feedDays: ['2026-11-25'] }, [], false)).toEqual(due)
    expect(firstExposureGate(one, melb('2026-11-28'), due, none, [], true)).toEqual(due)
  })
  it('a day before the event is never touched by the gate', () => {
    const before = momentsDue(one, melb('2026-11-27'), none)
    expect(firstExposureGate(one, melb('2026-11-27'), before, none, [], false)).toEqual(before)
  })
  it("a weekly night counts its season's earlier posts as its exposure", () => {
    const runs = runsOf(['2026-11-21', '2026-11-28'].map((d, i) => night({ eventId: `w${i}`, seriesId: 'S1', startDate: `${d}T08:00:00Z`, endDate: `${d}T12:00:00Z` })))
    const second = runs.find((r) => r.days[0] === '2026-11-28')!
    const first = runs.find((r) => r.days[0] === '2026-11-21')!
    const byRun = new Map([[first.key, { feedDays: ['2026-11-21'], storyDays: [] }]])
    expect(seasonDaysOf(second, byRun)).toEqual(['2026-11-21'])
    const d = momentsDue(second, melb('2026-11-28'), none)
    expect(firstExposureGate(second, melb('2026-11-28'), d, none, seasonDaysOf(second, byRun), false)).toEqual(d)
  })
})

describe('the database and the run', () => {
  const sql = read('supabase/migrations/20261128060001_the_promotion_calendar.sql')
  it('keeps the lead times in a versioned config table seeded from section 1, never in code, and the calendar per event and stage', () => {
    expect(sql).toContain("('major', 'initial', 42, null, false, 'operating model 27 Nov', 'Section 1 default: major concerts and festivals')")
    expect(sql).toContain("('comedy_nightlife', 'final', 0, null, true,")
    expect(sql).toContain('unique (event_type, stage, version)')
    expect(sql).toContain('unique (event_id, stage)')
    expect(sql).toContain("exception_reason text check (not exception or length(trim(exception_reason)) >= 10)")
    expect(sql).toContain('revoke all on public.promotion_lead_times, public.event_promotions from anon, authenticated, service_role;')
    expect(read('src/lib/social/promotion-calendar.ts')).not.toMatch(/days_before:\s*\d|daysBefore:\s*\d/)
  })
  it('rides the social run once a day at the prepare hour, contained, its line its own row', () => {
    const route = read('src/app/api/cron/social-publish/route.ts')
    expect(route).toContain('const PROMOTION_CALENDAR_HOUR = 22')
    expect(route).toContain('if (hourRun && melbourneHour(now) === PROMOTION_CALENDAR_HOUR) {')
    expect(route).toContain("await recordPhaseRun(db, { phase: 'prepare', ride: 'social', startedAt: began, endedAt: new Date(), units: cal.written, result: cal.line })")
  })
  it('the planner applies the gate after the stage rules', () => {
    const plan = read('src/lib/social/lifecycle-plan.ts')
    expect(plan).toContain('const excepted = input.ownerAsked !== undefined || run.nights.some((n) => exceptions.has(n.eventId))')
    expect(plan).toContain('const gated = firstExposureGate(run, input.now, momentsDue(run, input.now, runHistory), runHistory, seasonDaysOf(run, history.byRun), excepted)')
  })
})
