// THE JUST-ANNOUNCED ALERT ROUTER, AND THE TWO WAYS IT STOPPED SHORT IN SILENCE.
//
// This route is the demand engine's biggest lever: when an organiser announces a
// show, the people who follow them hear about it. CLAUDE.md's growth plan rests
// on it ("DICE gets about 40% of sales from discovery plus push"). Until this
// file existed, nothing tested the route at all - dispatch.ts and policy.ts were
// covered, and the route that decides WHO is dispatched to was not.
//
// ---------------------------------------------------------------------------
// FAULT 1: THE FOLLOWER LIST WAS READ UNBOUNDED.
//
// `saved_organisers` and `follows` were selected with no `.limit()` and no
// `.range()`. A Supabase project returns at most a fixed number of rows per
// response, 1,000 by default ("By default, Supabase projects return a maximum of
// 1,000 rows", https://supabase.com/docs/reference/javascript/select, fetched
// 2026-09-19). The truncation is silent: HTTP 200, `error` null, and an array
// that looks complete. Every follower past the ceiling was simply not a
// recipient.
//
// The ceiling is a per-project setting rather than a law of nature, so the fake
// below takes it as a parameter and the isolating tests set it small. What is
// being pinned is that the route PAGES its reads, not that the number is 1,000.
//
// ---------------------------------------------------------------------------
// FAULT 2: THE DISPATCH CAP COUNTED WORK THAT HAD ALREADY BEEN DONE.
//
// `dispatches += 1` ran BEFORE `dispatchAlert`, so an alert that was skipped as
// a duplicate spent a slot out of MAX_DISPATCHES exactly as a real send did.
//
// That is not a delay, it is a livelock, and the route's own header claimed the
// opposite: "this can run on a simple schedule without tracking a high-water
// mark and never double-sends". Events are read in `created_at` DESC order, so
// every run iterates the identical sequence; once the (event x follower) pairs in
// the fourteen-day window pass the cap, each run spends its entire budget
// re-confirming alerts it already sent, breaks at the same index, and the tail is
// never reached on any run. Worse, new events arrive at the FRONT of that order,
// so a platform that is growing pushes the unreached tail further away each time.
//
// The people the tail is made of are not random. A quiet-hours skip deliberately
// leaves its dedupe row unwritten so the next run retries - and that retry costs a
// slot too, so the users who asked for silence overnight are precisely the ones
// the cap starves.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { ReadFailed } from '@/lib/supabase/read-or-throw'

const h = vi.hoisted(() => ({
  /** The row ceiling the fake PostgREST applies to any read with no bound. */
  ceiling: 1000,
  /** Rows by table. */
  db: {} as Record<string, Record<string, unknown>[]>,
  /** `${userId}|${eventId}|${type}` for every alert already delivered. */
  delivered: new Set<string>(),
  /** Users whose alert is held by quiet hours: skipped, no dedupe row written. */
  quiet: new Set<string>(),
  /**
   * Users with no channel at all. `dispatchAlert` writes no dedupe row for these
   * either, because opting out must not permanently destroy a future alert - so
   * they are reconsidered on every run, for ever, exactly like a duplicate was.
   */
  optedOut: new Set<string>(),
  /** Every dispatchAlert call, in order. */
  calls: [] as { userId: string; eventId: string }[],
  broadcastArtists: false,
  /**
   * Users whose dispatch RAISES because a read could not be made. The real
   * dispatcher throws ReadFailed rather than deciding, so the route has to
   * defer that one recipient and carry on; without the catch, the first one
   * of these abandons every recipient and every event left in the pass.
   */
  blinking: new Set<string>(),
}))

vi.mock('@/lib/cron/auth', () => ({ requireCronAuth: () => null }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://example.test' }))
vi.mock('@/lib/flags/broadcast', () => ({
  isFeatureEnabled: async () => h.broadcastArtists,
}))

/**
 * The real dispatcher, reduced to the three things this route depends on.
 *
 * IT WRITES THE DEDUPE ROW, because that row is what a later run reads to learn
 * the work is done, and a fake that tracked delivery only in its own Set would
 * have hidden the very defect this file is about.
 *
 * IT WRITES NOTHING on a quiet-hours or opted-out skip, which is the real
 * dispatcher's deliberate behaviour: suppression would need a row and would
 * silently destroy a future alert, so both are DEFERRALS and both come back.
 */
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchAlert: vi.fn(async (input: { userId: string; eventId: string; type: string }) => {
    h.calls.push({ userId: input.userId, eventId: input.eventId })
    const key = `${input.userId}|${input.eventId}|${input.type}`
    if (h.blinking.has(input.userId)) throw new ReadFailed('notification-prefs', new Error('fetch failed'))
    if (h.delivered.has(key)) return { status: 'skipped', reason: 'duplicate' }
    if (h.optedOut.has(input.userId)) return { status: 'skipped', reason: 'opted_out' }
    if (h.quiet.has(input.userId)) return { status: 'skipped', reason: 'quiet_hours' }
    h.delivered.add(key)
    ;(h.db.notifications ||= []).push({
      user_id: input.userId,
      event_id: input.eventId,
      type: input.type,
    })
    return { status: 'sent', channel: 'push' }
  }),
}))

/* ---------------------------------------------------------------- the fake db */

type Filter = { op: 'eq' | 'in' | 'gte'; column: string; value: unknown }

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every(({ op, column, value }) => {
    const cell = row[column]
    if (op === 'eq') return cell === value
    if (op === 'in') return (value as unknown[]).includes(cell)
    if (op === 'gte') return String(cell) >= String(value)
    throw new Error(`the fake does not implement ${op}`)
  })
}

/**
 * A read that mirrors the two PostgREST behaviours this file is about: rows come
 * back in insertion order unless an `order` is asked for, and a read with no
 * `limit` or `range` stops at the project's ceiling without saying so.
 */
function builder(table: string) {
  const filters: Filter[] = []
  const orders: { column: string; ascending: boolean }[] = []
  let bound: { from: number; to: number } | null = null
  let bounded = false

  const api = {
    select: () => api,
    eq(column: string, value: unknown) {
      filters.push({ op: 'eq', column, value })
      return api
    },
    in(column: string, value: unknown[]) {
      filters.push({ op: 'in', column, value })
      return api
    },
    gte(column: string, value: unknown) {
      filters.push({ op: 'gte', column, value })
      return api
    },
    order(column: string, opts?: { ascending?: boolean }) {
      orders.push({ column, ascending: opts?.ascending !== false })
      return api
    },
    limit(n: number) {
      bounded = true
      bound = { from: 0, to: n - 1 }
      return api
    },
    range(from: number, to: number) {
      bounded = true
      bound = { from, to }
      return api
    },
    then(resolve: (v: unknown) => void) {
      let rows = (h.db[table] ?? []).filter((r) => matches(r, filters))
      for (const o of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = String(a[o.column])
          const y = String(b[o.column])
          return (x < y ? -1 : x > y ? 1 : 0) * (o.ascending ? 1 : -1)
        })
      }
      // The ceiling applies to every response, bounded or not: a `range` wider
      // than the ceiling is truncated to it exactly as PostgREST truncates one.
      const from = bound ? bound.from : 0
      const width = bound ? bound.to - bound.from + 1 : rows.length
      const page = rows.slice(from, from + Math.min(width, h.ceiling))
      void bounded
      resolve({ data: page.map((r) => ({ ...r })), error: null })
    },
  }
  return api
}

const admin = { from: (table: string) => builder(table) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const { GET } = await import('@/app/api/cron/notify-just-announced/route')

function request(): NextRequest {
  return new Request('https://eventlinqs.com/api/cron/notify-just-announced') as unknown as NextRequest
}

/** An event published now, starting in the future, so the route's filters pass. */
function seedEvent(id: string, orgId: string, createdAt: string) {
  ;(h.db.events ||= []).push({
    id,
    title: `Lane C ${id}`,
    slug: `lane-c-${id}`,
    organisation_id: orgId,
    venue_city: 'Melbourne',
    start_date: new Date(Date.now() + 30 * 86400_000).toISOString(),
    created_at: createdAt,
    status: 'published',
    visibility: 'public',
  })
}

function seedFollowers(orgId: string, count: number, prefix = 'u') {
  for (let i = 0; i < count; i += 1) {
    ;(h.db.saved_organisers ||= []).push({
      organisation_id: orgId,
      user_id: `${prefix}-${String(i).padStart(5, '0')}`,
    })
  }
}

/**
 * A user with every channel switched off, stated BOTH ways it is really stated:
 * the preferences row the route reads in bulk, and the dispatcher's own verdict.
 * A user with no row at all gets DEFAULT_PREFS and is always reachable, so the
 * row is the only thing that can make somebody unreachable.
 */
function optOut(userId: string) {
  h.optedOut.add(userId)
  ;(h.db.notification_prefs ||= []).push({
    user_id: userId,
    push_enabled: false,
    email_enabled: false,
  })
}

async function run() {
  const res = await GET(request())
  return (await res.json()) as {
    ok: boolean
    events: number
    dispatches: number
    sent: number
    deferred: number
    blinked: number
  }
}

/** Distinct users the route has ever dispatched to, for a given event. */
function reached(eventId: string) {
  return new Set(h.calls.filter((c) => c.eventId === eventId).map((c) => c.userId))
}

beforeEach(() => {
  h.ceiling = 1000
  h.db = {}
  h.delivered = new Set()
  h.quiet = new Set()
  h.optedOut = new Set()
  h.calls = []
  h.broadcastArtists = false
  h.blinking = new Set()
  ;(h.db.organisations ||= []).push({ id: 'org-1', name: 'Lane C Presents' })
  ;(h.db.organisations ||= []).push({ id: 'org-2', name: 'Lane C Nights' })
})

describe('the just-announced router reads every follower', () => {
  it('alerts followers past the row ceiling, which an unbounded select hides', async () => {
    // Isolates FAULT 1: the ceiling is set small so the follower count is far
    // below MAX_DISPATCHES and the dispatch cap cannot be what stops the run.
    h.ceiling = 50
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 120)

    const first = await run()

    expect(reached('e1').size).toBe(120)
    expect(first.sent).toBe(120)
  })

  it('pages the artist follower list too, when the broadcast stage is on', async () => {
    h.ceiling = 50
    h.broadcastArtists = true
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 10)
    ;(h.db.event_artists ||= []).push({ event_id: 'e1', artist_id: 'a-1', status: 'confirmed' })
    for (let i = 0; i < 120; i += 1) {
      ;(h.db.follows ||= []).push({
        followable_id: 'a-1',
        followable_type: 'artist',
        user_id: `fan-${String(i).padStart(5, '0')}`,
      })
    }

    await run()

    // 10 organiser followers plus 120 artist followers, none of them shared.
    expect(reached('e1').size).toBe(130)
  })

  it('orders every paged read, because paging an unordered set loses rows', async () => {
    // A range over a non-deterministic order is not paging: Postgres may return
    // one row in two windows and another in none. The order must be unique, so
    // `user_id` rather than a timestamp.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/lib/notifications/audience.ts', 'utf8'),
    )
    const followerReads = source.match(/\.from\('(saved_organisers|follows)'\)/g) ?? []
    expect(followerReads.length).toBe(2)
    // Every follower read pages by range and settles ties on the unique column.
    expect(source.match(/\.order\('user_id'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // And the route itself no longer reaches for either table directly.
    const route = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/cron/notify-just-announced/route.ts', 'utf8'),
    )
    expect(route).not.toMatch(/\.from\('(saved_organisers|follows)'\)/)
  })
})

describe('the just-announced router drains its backlog', () => {
  it('sends to the tail on a later run instead of respending the cap on duplicates', async () => {
    // Isolates FAULT 2: the ceiling is effectively off, so every follower is
    // visible and the only thing that can stop the run is the dispatch cap.
    // One organisation, 600 followers, two events: 1,200 pairs against a cap of
    // 1,000, so the first run cannot finish and the second must carry on.
    h.ceiling = 100_000
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedEvent('e2', 'org-1', '2026-09-19T00:00:00.000Z')
    seedFollowers('org-1', 600)

    const first = await run()
    expect(first.sent).toBe(1000)

    const second = await run()
    expect(second.sent).toBe(200)
    expect(reached('e1').size).toBe(600)
    expect(reached('e2').size).toBe(600)
  })

  it('reaches every follower of a heavily followed organiser over repeated runs', async () => {
    // The operational truth, with the real default ceiling and both faults in
    // play at once: a cron on a schedule must converge.
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 2_400)

    for (let i = 0; i < 5; i += 1) await run()

    expect(reached('e1').size).toBe(2_400)
  })

  it('does not let a newly announced event starve the one announced before it', async () => {
    // Events are read newest first, so a new announcement arrives at the FRONT
    // of the iteration. If the cap counts work already done, the unreached tail
    // recedes every time the platform does the thing it is for.
    //
    // 1,200 followers means the first run cannot finish e1 on its own, so there
    // is a genuine tail for e2 to push away.
    h.ceiling = 100_000
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 1_200)
    await run()

    seedEvent('e2', 'org-1', '2026-09-21T00:00:00.000Z')
    for (let i = 0; i < 3; i += 1) await run()

    expect(reached('e1').size).toBe(1_200)
    expect(reached('e2').size).toBe(1_200)
  })

  it('still delivers to users held by quiet hours once the window passes', async () => {
    // A quiet-hours skip writes no dedupe row so a later run retries it. Under
    // the old cap that retry cost a slot exactly as a send did, so the people who
    // asked for silence overnight were the ones the cap starved - and a city's
    // worth of followers sharing a timezone is precisely this shape.
    h.ceiling = 100_000
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 1_500)
    for (let i = 0; i < 1_500; i += 1) h.quiet.add(`u-${String(i).padStart(5, '0')}`)

    const first = await run()
    expect(first.sent).toBe(0)
    expect(first.deferred).toBeGreaterThan(0)

    h.quiet.clear()
    for (let i = 0; i < 3; i += 1) await run()

    expect(reached('e1').size).toBe(1_500)
    expect(h.delivered.has('u-01499|e1|just_announced')).toBe(true)
  })

  it('is not starved by followers who have switched every channel off', async () => {
    // The third way the cap was spent on work that could never finish. An
    // opted-out recipient gets no dedupe row either - opting out must not destroy
    // a future alert - so under the old cap a large opted-out set sitting ahead of
    // everybody else consumed the whole budget on every run, for ever.
    h.ceiling = 100_000
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 1_400)
    for (let i = 0; i < 1_200; i += 1) optOut(`u-${String(i).padStart(5, '0')}`)

    for (let i = 0; i < 3; i += 1) await run()

    // The 200 who can still be reached must be reached.
    for (let i = 1_200; i < 1_400; i += 1) {
      expect(h.delivered.has(`u-${String(i).padStart(5, '0')}|e1|just_announced`)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// FAULT 3: ONE RECIPIENT'S BLINKED READ WOULD HAVE ABANDONED THE WHOLE RUN.
//
// Added 21 September 2026 with the fix that made `dispatchAlert` RAISE instead
// of deciding. That fix is only half a bargain: the dispatcher refuses to guess,
// and this route has to be the thing that absorbs the refusal. Without the
// per-recipient catch the first flaky read reaches the route's outer handler,
// the response is a 500, and every recipient and every event left in the pass is
// dropped, because the loop never gets back to them.
//
// It is counted SEPARATELY from the quiet-hours deferral for the reason this
// file already gives about `deferred`: a run that held four hundred alerts
// because the database was blinking and a run that held them because it was
// midnight must never read the same from outside.

describe('the just-announced router survives a read it could not make', () => {
  it('defers the one recipient whose read blinked and still reaches everybody else', async () => {
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 5)
    h.blinking.add('u-00002')

    const result = await run()

    expect(result.ok).toBe(true)
    expect(result.blinked).toBe(1)
    expect(result.sent).toBe(4)
    // The blinked recipient is not marked delivered, so the next run tries again.
    expect(h.delivered.has('u-00002|e1|just_announced')).toBe(false)
    for (const i of [0, 1, 3, 4]) {
      expect(h.delivered.has(`u-0000${i}|e1|just_announced`)).toBe(true)
    }
  })

  it('reaches the deferred recipient on the next run, once the read works again', async () => {
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 3)
    h.blinking.add('u-00001')

    const first = await run()
    expect(first.blinked).toBe(1)
    expect(first.sent).toBe(2)

    h.blinking.clear()
    const second = await run()

    expect(second.blinked).toBe(0)
    expect(second.sent).toBe(1)
    expect(h.delivered.has('u-00001|e1|just_announced')).toBe(true)
  })

  it('does not swallow a fault that is not a read, because a broken cron must say so', async () => {
    // The catch is deliberately narrow. Anything that is not a ReadFailed is a
    // fault in this route and still takes the run down loudly, which is what a
    // 500 on a cron is for. A catch-all here would hide a real bug behind a
    // counter nobody reads.
    seedEvent('e1', 'org-1', '2026-09-20T00:00:00.000Z')
    seedFollowers('org-1', 2)
    const dispatch = await import('@/lib/notifications/dispatch')
    vi.mocked(dispatch.dispatchAlert).mockRejectedValueOnce(new TypeError('a genuine bug'))

    const res = await GET(request())
    expect(res.status).toBe(500)
  })
})
