import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEASE_SECONDS, overdueNow, PIECE_OVERDUE_MINUTES, publishRunRow, RUN_MISSING_MINUTES, socialWatchdog } from '@/lib/social/publish-run'

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
  it('a run missing for more than 70 minutes is overdue; a fresh one is not', () => {
    expect(overdueNow({ now: NOW, lastRunAt: ago(RUN_MISSING_MINUTES + 1), switchOn: true, oldestDue: null }).join(' ')).toMatch(/more than 70/)
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: null })).toEqual([])
    expect(overdueNow({ now: NOW, lastRunAt: null, switchOn: false, oldestDue: null })).toEqual(['no social publish run is recorded'])
  })

  it('a piece 30 minutes past its slot is overdue only while the switch is on', () => {
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: ago(PIECE_OVERDUE_MINUTES + 1) }).join(' ')).toMatch(/past its slot with the switch on/)
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: false, oldestDue: ago(120) })).toEqual([])
    expect(overdueNow({ now: NOW, lastRunAt: ago(5), switchOn: true, oldestDue: ago(10) })).toEqual([])
  })
})

/** A database that answers the watchdog's three reads and keeps what it writes. */
function fakeDb(state: { lastRunAt: string | null; switchOn: boolean; oldestDue: string | null }) {
  const writes: Record<string, unknown>[] = []
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
        maybeSingle: async () => ({ data: answer[table] ?? null, error: null }),
        insert: async (row: Record<string, unknown>) => (writes.push({ table, ...row }), { error: null }),
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
    for (const work of ['if (melbourneHour(now) === PREFLIGHT_HOUR)', 'approveUnderStandingPolicy(db', 'await scheduleApprovedPieces(db, now)', 'await publishDuePieces(db, now']) {
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
