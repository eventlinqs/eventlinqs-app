import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOURLY_FLAG, isHourRun, LEASE_SECONDS, LEGACY_WINDOW_MINUTES, overdueNow, PIECE_OVERDUE_MINUTES, publishRunRow, reversalReasons, RUN_MISSING_MINUTES, socialWatchdog } from '@/lib/social/publish-run'

/*
 * THE PUBLISHING RUN, ACCOUNTED FOR AND WATCHED (Lawal's hardening order of 22 November 2026, sections 2 E and 4; tests 6,
 * 11 and 12 of its section 5 at the code's level). On 22 November no hourly social run wrote a row of its own, a held
 * piece turned the whole engine off, and nothing independent noticed the engine was silent from 08:40.
 */
const route = readFileSync(join(process.cwd(), 'src/app/api/cron/social-publish/route.ts'), 'utf8').replace(/\r\n/g, '\n')
const sentinel = readFileSync(join(process.cwd(), 'src/app/api/cron/health-sentinel/route.ts'), 'utf8').replace(/\r\n/g, '\n')
const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261122094501_social_publish_recovery.sql'), 'utf8')

const NOW = new Date('2026-11-21T23:45:00Z') // 10:45 in Melbourne
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

describe('the run row', () => {
  it('keeps every count whole and never negative, and its end never before its start', () => {
    const row = publishRunRow({ route: '/api/cron/social-publish', startedAt: NOW, endedAt: ago(1), deployment: 'ddac8595', switchOn: true, drawn: -1, approved: 2.4, scheduled: 1, due: 3, published: 1, held: 1, failed: 0, ok: true, result: ' ' })
    expect(row).toMatchObject({ drawn: 0, approved: 2, ended_at: NOW.toISOString(), result: 'no result named', switch_on: true, deployment: 'ddac8595' })
  })
})

describe('what is overdue (the watchdog judges)', () => {
  it('a run missing for more than 25 minutes (two ten-minute runs missed) is overdue; a fresh one is not', () => {
    expect(RUN_MISSING_MINUTES).toBe(25)
    expect(overdueNow({ now: NOW, lastRunAt: ago(RUN_MISSING_MINUTES + 1), switchOn: true, oldestDue: null }).join(' ')).toMatch(/more than 25/)
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: null })).toEqual([])
    expect(overdueNow({ now: NOW, lastRunAt: null, switchOn: false, oldestDue: null })).toEqual(['no social publish run is recorded'])
  })

  it('a piece 20 minutes past its slot is overdue only while the switch is on', () => {
    expect(PIECE_OVERDUE_MINUTES).toBe(20)
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: ago(PIECE_OVERDUE_MINUTES + 1) }).join(' ')).toMatch(/past its slot with the switch on/)
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: false, oldestDue: ago(120) })).toEqual([])
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: ago(10) })).toEqual([])
  })
})

/** A database that answers the watchdog's reads (and the reversal's two lists) and keeps what it writes. */
function fakeDb(state: { lastRunAt: string | null; switchOn: boolean; oldestDue: string | null; latestAt?: string | null; runs?: unknown[]; postings?: unknown[] }) {
  const writes: Record<string, unknown>[] = []
  const lists: Record<string, unknown[]> = {
    social_publish_runs: state.runs ?? [],
    social_piece_postings: state.postings ?? [],
    social_piece_schedules: state.oldestDue ? [{ go_at: state.oldestDue, latest_at: state.latestAt ?? null }] : [],
  }
  const answer: Record<string, unknown> = {
    social_publish_runs: state.lastRunAt ? { started_at: state.lastRunAt } : null,
    feature_flags: { enabled: state.switchOn },
    social_piece_schedules: state.oldestDue ? { go_at: state.oldestDue } : null,
  }
  const db = {
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        lt: () => q,
        order: () => q,
        limit: () => q,
        gte: () => q,
        is: () => q,
        maybeSingle: async () => ({ data: answer[table] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: lists[table] ?? [], error: null }).then(ok),
        insert: async (row: Record<string, unknown>) => (writes.push({ table, ...row }), { error: null }),
        update: (row: Record<string, unknown>) => ({ eq: async (_c: string, v: unknown) => (writes.push({ table, update: v, ...row }), { error: null }) }),
      }
      return q
    },
  }
  return { db: db as never, writes }
}

describe('the watchdog (test 11: a missed run detected and recovered, once, through the one route)', () => {
  it('a missed run: the publish route is called once with the cron secret, and its action is written as a row', async () => {
    const { db, writes } = fakeDb({ lastRunAt: ago(95).toISOString(), switchOn: true, oldestDue: null })
    const calls: { url: string; auth: string | null }[] = []
    const fetcher = async (url: string, init?: RequestInit) => (calls.push({ url, auth: new Headers(init?.headers).get('authorization') }), new Response('{}', { status: 200 }))
    const out = await socialWatchdog(db, { now: NOW, origin: 'https://www.eventlinqs.com.au/', secret: 's3cret', fetcher })
    expect(calls).toEqual([{ url: 'https://www.eventlinqs.com.au/api/cron/social-publish', auth: 'Bearer s3cret' }])
    expect(out.action).toBe('the publish route called once: HTTP 200')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ table: 'social_publish_runs', route: '/api/cron/health-sentinel#watchdog', ok: true })
  })

  it('nothing overdue: nothing is called and nothing is written', async () => {
    const { db, writes } = fakeDb({ lastRunAt: ago(4).toISOString(), switchOn: true, oldestDue: ago(5).toISOString() })
    let called = 0
    const out = await socialWatchdog(db, { now: NOW, origin: 'https://x', secret: 's', fetcher: async () => (called++, new Response('{}')) })
    expect(out).toEqual({ overdue: [], action: 'none needed' })
    expect(called).toBe(0)
    expect(writes).toHaveLength(0)
  })

  it('a dry pass reports and calls nothing; a failed call is written failed', async () => {
    const dry = fakeDb({ lastRunAt: null, switchOn: true, oldestDue: null })
    let called = 0
    expect((await socialWatchdog(dry.db, { now: NOW, origin: 'https://x', secret: 's', dry: true, fetcher: async () => (called++, new Response('{}')) })).action).toMatch(/^dry/)
    expect(called).toBe(0)
    const down = fakeDb({ lastRunAt: ago(200).toISOString(), switchOn: true, oldestDue: null })
    const out = await socialWatchdog(down.db, { now: NOW, origin: 'https://x', secret: 's', fetcher: async () => new Response('', { status: 500 }) })
    expect(out.action).toBe('the publish route called once: HTTP 500')
    expect(down.writes[0]).toMatchObject({ ok: false, failed: 1 })
  })
})

describe('one publishing run at a time (tests 6 and 12 at the route: the lease before any work, released after)', () => {
  it('the route claims the lease before the pre-flight, the policy, scheduling or publishing, and a held lease does nothing', () => {
    const main = route.slice(route.indexOf('const holder = `social-publish'))
    const claim = main.indexOf('await claimPublishLease(db, holder)')
    expect(claim).toBeGreaterThan(-1)
    for (const work of ['if (hourRun && melbourneHour(now) === PREFLIGHT_HOUR)', 'approveUnderStandingPolicy(db', 'await scheduleApprovedPieces(db, now)', 'await publishDuePieces(db, now']) {
      expect(main.indexOf(work), work).toBeGreaterThan(claim)
    }
    expect(main.slice(claim, main.indexOf('/* THE PRE FLIGHT'))).toMatch(/if \(!lease\.held\) \{[\s\S]*return NextResponse\.json\(\{ ok: true, skipped: lease\.why \}\)/)
  })

  it('every run writes its own row with its deployment, then frees the lease', () => {
    const end = route.slice(route.indexOf('EVERY RUN WRITES ITS OWN ROW'))
    expect(end.indexOf('await recordPublishRun(db, {')).toBeGreaterThan(-1)
    expect(end).toMatch(/deployment: deploymentOf\(\),/)
    expect(end.indexOf('await releasePublishLease(db, holder)')).toBeGreaterThan(end.indexOf('await recordPublishRun(db, {'))
  })

  it('the lease is claimed atomically, only when free or expired, by the production worker only', () => {
    expect(migration).toMatch(/update public\.social_publish_lease\s+set holder = p_holder[\s\S]*where id = 1 and expires_at <= now\(\);/)
    expect(migration).toMatch(/grant execute on function public\.claim_social_publish_lease\(text, integer\) to service_role;/)
    expect(migration).toMatch(/revoke all on function public\.claim_social_publish_lease\(text, integer\) from public, anon, authenticated;/)
    expect(LEASE_SECONDS).toBeLessThanOrEqual(3600)
  })

  it('the health sentinel runs the watchdog every pass but a drill', () => {
    expect(sentinel).toMatch(/if \(!drill\) \{\s*try \{\s*watchdog = await socialWatchdog\(createAdminClient\(\)/)
  })
})

describe("every ten minutes, with the hour keeping its own work (the PM's 17:20 of 22 November 2026)", () => {
  it('vercel.json runs the publish route every ten minutes', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    expect(vercel.crons.find((c) => c.path === '/api/cron/social-publish')?.schedule).toBe('*/10 * * * *')
  })

  it("the hour's own run is the one at 40 to 49 minutes past, in Melbourne", () => {
    // 18:40, 18:49, 18:50 and 18:39 in Melbourne (daylight time, +11:00) on 22 November 2026.
    expect(isHourRun(new Date('2026-11-22T07:40:00Z'))).toBe(true)
    expect(isHourRun(new Date('2026-11-22T07:49:59Z'))).toBe(true)
    expect(isHourRun(new Date('2026-11-22T07:50:00Z'))).toBe(false)
    expect(isHourRun(new Date('2026-11-22T07:39:59Z'))).toBe(false)
  })

  it("the pre-flight, the week drawn again, the policy's approvals, the week's plan and the phase row stay in the hour's own run; scheduling and publishing run every time", () => {
    const main = route.slice(route.indexOf('const holder = `social-publish'))
    expect(main).toContain('if (hourRun && melbourneHour(now) === PREFLIGHT_HOUR) {')
    expect(main).toContain('if (hourRun) try {\n      redrawn = await redrawOlderLook(db, now)')
    expect(main).toContain('if (hourRun && POLICY_HOURS.has(melbourneHour(now))) {')
    expect(main).toContain('if (hourRun && (melbourneHour(now) === 6 || redrawn.redrawn.length > 0)) {')
    expect(main).toContain('const phase = hourRun ? socialPhaseAt(melbourneHour(now)) : null')
    expect(main).toMatch(/\n      scheduled = await scheduleApprovedPieces\(db, now\)\n/)
    expect(main).toMatch(/\n    const published = await publishDuePieces\(db, now,/)
  })
})

describe("the reversal, checked by the watchdog itself (the PM's 17:20)", () => {
  const run = (start: string, end: string, result = '0 scheduled; 1 due; 1 published, 0 held') => ({ started_at: start, ended_at: end, result })

  it('two runs that both held the lease and overlap are found; a run that found the lease held never counts', () => {
    expect(reversalReasons([run('2026-11-22T07:40:00Z', '2026-11-22T07:41:00Z'), run('2026-11-22T07:50:00Z', '2026-11-22T07:50:05Z')], [])).toEqual([])
    expect(reversalReasons([run('2026-11-22T07:40:00Z', '2026-11-22T07:52:00Z'), run('2026-11-22T07:50:00Z', '2026-11-22T07:50:05Z')], [])).toEqual([
      'two publishing runs overlapped (started 2026-11-22T07:40:00Z and 2026-11-22T07:50:00Z)',
    ])
    expect(reversalReasons([run('2026-11-22T07:40:00Z', '2026-11-22T07:52:00Z'), run('2026-11-22T07:50:00Z', '2026-11-22T07:50:01Z', 'skipped: the lease is held')], [])).toEqual([])
  })

  it('a piece with two posting rows on one network is found', () => {
    expect(reversalReasons([], [{ piece_id: 'p1', platform: 'instagram' }, { piece_id: 'p1', platform: 'facebook' }])).toEqual([])
    expect(reversalReasons([], [{ piece_id: 'p1', platform: 'instagram' }, { piece_id: 'p1', platform: 'instagram' }])).toEqual(['a piece has 2 posting rows on one network (p1 instagram)'])
  })

  it('on an overlap the watchdog turns the hourly switch on, says why in its row, marks the row failed, and calls nothing when nothing is overdue', async () => {
    const { db, writes } = fakeDb({
      lastRunAt: ago(4).toISOString(),
      switchOn: true,
      oldestDue: null,
      runs: [run('2026-11-21T23:30:00Z', '2026-11-21T23:42:00Z'), run('2026-11-21T23:40:00Z', '2026-11-21T23:40:09Z')],
    })
    let called = 0
    const out = await socialWatchdog(db, { now: NOW, origin: 'https://x', secret: 's', fetcher: async () => (called++, new Response('{}')) })
    expect(called).toBe(0)
    expect(out.reversal).toMatch(new RegExp(`^${HOURLY_FLAG} turned on: two publishing runs overlapped`))
    expect(writes).toContainEqual(expect.objectContaining({ table: 'feature_flags', update: HOURLY_FLAG, enabled: true }))
    expect(writes.find((w) => w.table === 'social_publish_runs')).toMatchObject({ ok: false, failed: 1 })
  })

  it("the route honours the switch: every run but the hour's own does nothing while it is on, and says so", () => {
    const main = route.slice(route.indexOf('const hourRun = isHourRun(now)'))
    expect(main.indexOf("db.from('feature_flags').select('enabled').eq('flag', HOURLY_FLAG)")).toBeGreaterThan(-1)
    expect(main.indexOf('if (!hourRun) {')).toBeLessThan(main.indexOf('await scheduleApprovedPieces(db, now)'))
    expect(main).toMatch(/result: `skipped: \$\{HOURLY_FLAG\} is on \(the watchdog's reversal\)/)
  })
})

describe("the watchdog never revives expired content (Lawal's 19:13 of 22 November 2026, section 4, point 5)", () => {
  const call = async (state: Parameters<typeof fakeDb>[0]) => {
    const { db } = fakeDb(state)
    let called = 0
    const out = await socialWatchdog(db, { now: NOW, origin: 'https://x', secret: 's', fetcher: async () => (called++, new Response('{}')) })
    return { called, out }
  }

  it('a piece 25 minutes past its slot and inside its window is recovered: the route is called once', async () => {
    const r = await call({ lastRunAt: ago(4).toISOString(), switchOn: true, oldestDue: ago(25).toISOString(), latestAt: new Date(NOW.getTime() + 60 * 60_000).toISOString() })
    expect(r.called).toBe(1)
  })

  it('a piece past its latest acceptable time is never a reason to call: nothing is called', async () => {
    const r = await call({ lastRunAt: ago(4).toISOString(), switchOn: true, oldestDue: ago(25).toISOString(), latestAt: ago(1).toISOString() })
    expect(r.called).toBe(0)
  })

  it('a row from before the window was stored counts only within 30 minutes of its slot', async () => {
    expect(LEGACY_WINDOW_MINUTES).toBe(30)
    expect((await call({ lastRunAt: ago(4).toISOString(), switchOn: true, oldestDue: ago(25).toISOString() })).called).toBe(1)
    expect((await call({ lastRunAt: ago(4).toISOString(), switchOn: true, oldestDue: ago(31).toISOString() })).called).toBe(0)
  })

  it('a piece the provider may already hold (a submission on record) is the scheduled run to reconcile, never the watchdog to resend', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/social/publish-run.ts'), 'utf8')
    expect(src).toMatch(/\.eq\('state', 'scheduled'\)\s*\.is\('submission_ref', null\)/)
  })
})
