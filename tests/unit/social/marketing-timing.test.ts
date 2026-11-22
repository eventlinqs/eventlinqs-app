import { describe, expect, it, vi } from 'vitest'
import { pastLatest, timingOf, type TimingNight } from '@/lib/social/timing'
import { publishDuePieces, timingOfRows } from '@/lib/social/store'

/*
 * THE MARKETING TIMING AND RELEVANCE ENGINE (Lawal, 19:13 of 22 November 2026, verbatim at MARKETING-TIMING-22NOV.md,
 * section 8: "Tests must demonstrate that inappropriate late posts are prevented without unnecessarily blocking useful,
 * eligible promotions."). Red on main: src/lib/social/timing.ts and the EXPIRED state do not exist there, and AMCF's
 * final day story, held only by a caption check at 18:40, would have been sent by the 19:14 watchdog call.
 * Each case is one of the directive's list, by its own words.
 */

const at = (iso: string) => new Date(iso)
const MEL = 'Australia/Melbourne'

// AMCF as production holds it: one row for three days, 11am to 8pm each day, free (events 5d664060).
const AMCF: TimingNight = { title: 'African Music and Cultural Festival 2026', startDate: '2026-11-20T00:00:00Z', endDate: '2026-11-22T09:00:00Z', timezone: MEL, status: 'published', isFree: true }

describe("a multi day festival's final day (AMCF's exact rows: go 18:00, closes 20:00)", () => {
  const t = timingOf({ moment: 'final_day', day: '2026-11-22', nights: [AMCF], preferredAt: at('2026-11-22T07:00:00Z'), multiDay: true }, at('2026-11-22T07:00:00Z'))

  it('its window: a long day, useful while two hours remain, so its latest acceptable time is 6pm', () => {
    expect(t).toMatchObject({ kind: 'window', objective: 'multi_day', latestAt: '2026-11-22T07:00:00.000Z', expiresAt: '2026-11-22T09:00:00.000Z', recovery: 'within_window' })
  })

  it('at 6pm it may go; at 7pm, an hour before it closes, it is EXPIRED and never posted; revision 4 at 6:43pm is EXPIRED', () => {
    if (t.kind !== 'window') throw new Error('no window')
    expect(pastLatest(t.latestAt, at('2026-11-22T07:00:00Z'))).toBeNull()
    expect(pastLatest(t.latestAt, at('2026-11-22T08:00:00Z'))).toMatch(/^EXPIRED: its latest acceptable time, 2026-11-22T07:00:00\.000Z, passed 60 minutes ago/)
    expect(pastLatest(t.latestAt, at('2026-11-22T07:43:47Z'))).toMatch(/^EXPIRED: /)
  })

  it('the same final day at 3pm, five hours before it closes, is a useful post and is not blocked', () => {
    const early = timingOf({ moment: 'final_day', day: '2026-11-22', nights: [AMCF], preferredAt: at('2026-11-22T04:00:00Z'), multiDay: true }, at('2026-11-22T04:00:00Z'))
    if (early.kind !== 'window') throw new Error('no window')
    expect(pastLatest(early.latestAt, at('2026-11-22T04:00:00Z'))).toBeNull()
  })
})

describe('an event ending within an hour, and an event already ended', () => {
  // A market, 9am to 2pm on Saturday 28 November 2026.
  const market: TimingNight = { title: 'Harbour Market', startDate: '2026-11-27T22:00:00Z', endDate: '2026-11-28T03:00:00Z', timezone: MEL, status: 'published', isFree: true }

  it('ending within an hour (1pm for a 2pm close): EXPIRED', () => {
    const t = timingOf({ moment: 'running', day: '2026-11-28', nights: [market], preferredAt: at('2026-11-28T02:00:00Z') }, at('2026-11-28T02:00:00Z'))
    if (t.kind !== 'window') throw new Error('no window')
    expect(t.objective).toBe('free_community')
    expect(pastLatest(t.latestAt, at('2026-11-28T02:00:00Z'))).toMatch(/^EXPIRED: /)
  })

  it('a free event with time remaining (10am, four hours left): not blocked', () => {
    const t = timingOf({ moment: 'running', day: '2026-11-28', nights: [market], preferredAt: at('2026-11-27T23:00:00Z') }, at('2026-11-27T23:00:00Z'))
    if (t.kind !== 'window') throw new Error('no window')
    expect(pastLatest(t.latestAt, at('2026-11-27T23:00:00Z'))).toBeNull()
  })

  it('already ended: its status says so (completed), or its time has passed: EXPIRED either way', () => {
    expect(timingOf({ moment: 'running', day: '2026-11-28', nights: [{ ...market, status: 'completed' }], preferredAt: null }, at('2026-11-28T05:00:00Z'))).toMatchObject({ kind: 'expired' })
    const t = timingOf({ moment: 'build', day: '2026-11-28', nights: [market], preferredAt: at('2026-11-28T05:00:00Z') }, at('2026-11-28T05:00:00Z'))
    if (t.kind !== 'window') throw new Error('no window')
    expect(pastLatest(t.latestAt, at('2026-11-28T05:00:00Z'))).toMatch(/^EXPIRED: /)
  })
})

describe('a post that missed its useful window, and a recovery attempt after expiry', () => {
  // A paid concert at 8pm on Friday 4 December 2026 (a short session): promoted until two hours before its doors.
  const concert: TimingNight = { title: 'The Night Owls', startDate: '2026-12-04T09:00:00Z', endDate: '2026-12-04T12:00:00Z', timezone: MEL, status: 'published', isFree: false }

  it('its tomorrow story missed its day: EXPIRED at claiming', () => {
    const t = timingOf({ moment: 'tomorrow', day: '2026-12-03', nights: [concert], preferredAt: at('2026-12-03T07:00:00Z') }, at('2026-12-03T07:00:00Z'))
    if (t.kind !== 'window') throw new Error('no window')
    expect(t.objective).toBe('booking_reminder')
    expect(pastLatest(t.latestAt, at('2026-12-03T08:00:00Z'))).toBeNull()
    expect(pastLatest(t.latestAt, at('2026-12-03T14:00:00Z'))).toMatch(/^EXPIRED: /)
  })

  it('a recovery after expiry: a stored window passed means the claim expires it before any provider call or check', async () => {
    const updates: { id: unknown; payload: Record<string, unknown> }[] = []
    const rows = [{ id: 's1', piece_id: 'p1', approval_id: 'a1', platform: 'instagram', go_at: '2026-12-03T02:00:00Z', latest_at: '2026-12-03T06:00:00Z', objective: 'booking_reminder' }]
    const answers = (result: unknown): unknown => {
      const link: object = new Proxy({}, { get: (_t, key) => (key === 'then' ? (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) : () => link) })
      return link
    }
    const db = {
      from(table: string) {
        if (table === 'feature_flags') return answers({ data: { enabled: true }, error: null })
        if (table === 'social_pieces') return answers({ data: null, error: null })
        if (table === 'social_piece_schedules') {
          return {
            select: (cols: string) => answers({ data: cols === 'id, published_ref' || cols === 'submission_ref' ? [] : rows, error: null }),
            update: (payload: Record<string, unknown>) => ({ eq: (_k: string, id: unknown) => (updates.push({ id, payload }), answers({ error: null })) }),
          }
        }
        throw new Error(`an expired schedule reads nothing else: ${table}`)
      },
    }
    const publisher = vi.fn()
    // 6pm, an hour past its 5pm latest, on the same Melbourne day (law 42's earlier-day rule is not what stops it).
    const out = await publishDuePieces(db as never, at('2026-12-03T07:00:00Z'), { siteOrigin: 'https://www.eventlinqs.com.au', publisher })
    expect(publisher).not.toHaveBeenCalled()
    expect(out.published).toEqual([])
    expect(updates).toHaveLength(1)
    expect(updates[0].payload.state).toBe('expired')
    expect(String(updates[0].payload.held_reason)).toMatch(/^EXPIRED: its latest acceptable time, 2026-12-03T06:00:00Z, passed 60 minutes ago/)
  })

  it('a valid post delayed by a provider failure is recovered while its window holds, and only then', () => {
    const t = timingOf({ moment: 'build', day: '2026-12-01', nights: [concert], preferredAt: at('2026-11-30T21:00:00Z') }, at('2026-11-30T21:00:00Z'))
    if (t.kind !== 'window') throw new Error('no window')
    expect(t.recovery).toBe('within_window')
    // An hour late, still Tuesday 1 December: recovered (the provider's own record is read first: posted-as-it-went.test.ts).
    expect(pastLatest(t.latestAt, at('2026-11-30T22:00:00Z'))).toBeNull()
    // The next day: expired, never recovered.
    expect(pastLatest(t.latestAt, at('2026-12-01T14:00:00Z'))).toMatch(/^EXPIRED: /)
  })
})

describe('a future concert needing advance booking, and a recurring event', () => {
  it('a concert in ten days: an advance sales build post today is inside its window, not blocked', () => {
    const concert: TimingNight = { title: 'The Night Owls', startDate: '2026-12-04T09:00:00Z', endDate: '2026-12-04T12:00:00Z', timezone: MEL, status: 'published', isFree: false }
    const t = timingOf({ moment: 'build', day: '2026-11-24', nights: [concert], preferredAt: at('2026-11-23T22:00:00Z') }, at('2026-11-23T22:00:00Z'))
    expect(t).toMatchObject({ kind: 'window', objective: 'advance_sales' })
    if (t.kind === 'window') expect(pastLatest(t.latestAt, at('2026-11-23T22:00:00Z'))).toBeNull()
  })

  it("a recurring event promotes its next occurrence: last week's piece expires, this week's is inside its window", () => {
    const last: TimingNight = { title: 'Trivia Tuesday', startDate: '2026-11-17T08:30:00Z', endDate: '2026-11-17T11:00:00Z', timezone: MEL, status: 'published', isFree: true }
    const next: TimingNight = { ...last, startDate: '2026-11-24T08:30:00Z', endDate: '2026-11-24T11:00:00Z' }
    const now = at('2026-11-24T02:00:00Z')
    const old = timingOf({ moment: 'running', day: '2026-11-17', nights: [last], preferredAt: at('2026-11-17T02:00:00Z'), recurring: true }, now)
    const fresh = timingOf({ moment: 'running', day: '2026-11-24', nights: [next], preferredAt: now, recurring: true }, now)
    if (old.kind !== 'window' || fresh.kind !== 'window') throw new Error('no window')
    expect(fresh.objective).toBe('recurring')
    expect(pastLatest(old.latestAt, now)).toMatch(/^EXPIRED: /)
    expect(pastLatest(fresh.latestAt, now)).toBeNull()
  })
})

describe('cancelled, postponed, sold out; missing facts; live coverage', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'e1',
    title: 'The Night Owls',
    start_date: '2026-12-04T09:00:00Z',
    end_date: '2026-12-04T12:00:00Z',
    timezone: MEL,
    status: 'published',
    is_free: false,
    ticket_tiers: [{ price: 45, total_capacity: 100, sold_count: 10, reserved_count: 0, is_active: true }],
    event_booking_links: [],
    ...over,
  })

  it('cancelled and postponed expire at once, read from the row', () => {
    expect(timingOfRows('build|feed|2026-11-24|k', [row({ status: 'cancelled' })], null, at('2026-11-23T22:00:00Z'))).toMatchObject({ kind: 'expired', reason: /cancelled/ })
    expect(timingOfRows('build|feed|2026-11-24|k', [row({ status: 'postponed' })], null, at('2026-11-23T22:00:00Z'))).toMatchObject({ kind: 'expired', reason: /postponed/ })
  })

  it('sold out expires at once: no place left to buy', () => {
    const t = timingOfRows('build|feed|2026-11-24|k', [row({ ticket_tiers: [{ price: 45, total_capacity: 100, sold_count: 100, reserved_count: 0, is_active: true }] })], null, at('2026-11-23T22:00:00Z'))
    expect(t).toMatchObject({ kind: 'expired', reason: /sold out/ })
  })

  it('a missing start holds that piece with the correction it needs (never guessed); a missing end is derived, labelled, never a hold (the PM, 19:33)', () => {
    expect(timingOf({ moment: 'build', nights: [{ title: 'Mystery Night', startDate: null, endDate: null, timezone: MEL }], preferredAt: null }, at('2026-11-23T22:00:00Z'))).toMatchObject({ kind: 'held', reason: /start is not on record/ })
    const t = timingOf({ moment: 'running', day: '2026-11-28', nights: [{ title: 'Open Studio', startDate: '2026-11-27T23:00:00Z', endDate: null, timezone: MEL }], preferredAt: null }, at('2026-11-27T23:00:00Z'))
    expect(t).toMatchObject({ kind: 'window', basis: /its end DERIVED as 3 hours after its start, none on record/ })
  })

  it("a timezone other than Melbourne: the window is set on the event's own clock (Perth)", () => {
    // A market in Perth, 9am to 2pm on Saturday 28 November 2026, Australia/Perth (UTC+8): it closes at 06:00Z.
    const perth: TimingNight = { title: 'Fremantle Market', startDate: '2026-11-28T01:00:00Z', endDate: '2026-11-28T06:00:00Z', timezone: 'Australia/Perth', status: 'published', isFree: true }
    const t = timingOf({ moment: 'running', day: '2026-11-28', nights: [perth], preferredAt: at('2026-11-28T02:00:00Z') }, at('2026-11-28T02:00:00Z'))
    expect(t).toMatchObject({ kind: 'window', latestAt: '2026-11-28T04:00:00.000Z' })
  })
  })

  it('live coverage only with approved content: without it, not planned; with it, while the session is open', () => {
    const base = { moment: 'final_day' as const, day: '2026-11-22', nights: [AMCF], preferredAt: at('2026-11-22T08:00:00Z'), objective: 'live_coverage' as const }
    expect(timingOf(base, at('2026-11-22T08:00:00Z'))).toMatchObject({ kind: 'held', reason: /approved content/ })
    const t = timingOf({ ...base, approvedContent: true }, at('2026-11-22T08:00:00Z'))
    expect(t).toMatchObject({ kind: 'window', objective: 'live_coverage', latestAt: '2026-11-22T09:00:00.000Z' })
    if (t.kind === 'window') expect(pastLatest(t.latestAt, at('2026-11-22T08:00:00Z'))).toBeNull()
  })

  it('a piece of no event (the organiser offer) is valid through its own day, never held for want of a night', () => {
    const t = timingOf({ moment: null, nights: [], preferredAt: at('2026-11-23T22:00:00Z') }, at('2026-11-23T22:00:00Z'))
    expect(t).toMatchObject({ kind: 'window', objective: 'discovery' })
  })
})
