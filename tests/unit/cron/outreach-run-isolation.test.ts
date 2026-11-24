// ONE MAILBOX, ONE PLAY, ONE STEP NEVER STOPS THE OUTREACH RUN (Lawal, 22 November 2026, 15:14: "No individual event,
// organiser, contact, message or failed job should be able to disable an entire business operation"; the PM's 15:15,
// F1). Planted failures: one mailbox's read throws, the plays throw, the judging throws. Each time the run answers 200,
// names the fault in its answer and in the phase record, and the sender and every other step still run.

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  throwInboxOf: null as string | null,
  throwPlays: false,
  throwJudging: false,
  calls: [] as string[],
  phase: [] as { result: string; failed: boolean }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { mode: 'live', from_address: 'hello@eventlinqs.com', changed_by: 'u1', dns_checked_at: new Date().toISOString() }, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ data: 0, error: null }),
  }),
}))
vi.mock('@/lib/outreach/graph', () => ({
  graphConfigFromEnv: () => ({ tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' }),
  graphReadInbox: async (cfg: { mailbox: string }) => {
    h.calls.push(`read ${cfg.mailbox}`)
    if (cfg.mailbox === h.throwInboxOf) throw new Error(`Graph 503 for ${cfg.mailbox}`)
    return []
  },
}))
vi.mock('@/lib/outreach/replies', () => ({
  handleInbox: async (_db: unknown, _m: unknown, deps: { mailbox: string }) => {
    h.calls.push(`handled ${deps.mailbox}`)
    return { read: 0, matched: 0, unmatched: 0, autoReplies: 0, bounces: 0, replies: [], failed: [] }
  },
}))
vi.mock('@/lib/outreach/planner', () => ({
  judgePlays: async () => {
    h.calls.push('judged')
    if (h.throwJudging) throw new Error('outreach_play_judgements: boom')
    return []
  },
  planPlays: async () => {
    h.calls.push('planned')
    if (h.throwPlays) throw new Error('outreach_plays: boom')
    return []
  },
  planDms: async () => (h.calls.push('dms'), []),
  planRelationship: async () => (h.calls.push('partners'), []),
  // Each play's decisions said in the log (the PM's 23:56): none to say here.
  playDecisionLines: () => [],
}))
vi.mock('@/lib/outreach/sender', () => ({
  runOutreachSender: async () => (h.calls.push('sender'), { mode: 'live', sent: [], failed: [], refused: [], outsideHours: 0 }),
  // The expiry sweep (event-validity.ts): no held or queued letter names a passed event here.
  expireLapsedLetters: async () => ({ voided: [], unread: [] }),
}))
vi.mock('@/lib/outreach/self-queue', () => ({ queueApprovedHeldLetters: async () => ({ queued: [], waiting: [] }), queueApprovedReplies: async () => ({ queued: [], waiting: [] }) }))
vi.mock('@/lib/ops/phase-runs', () => ({
  recordPhaseRun: async (_db: unknown, row: { result: string; failed: boolean }) => (h.phase.push({ result: row.result, failed: row.failed }), { ok: true }),
}))
vi.mock('@/lib/ops/timetable', () => ({ melbourneMinutes: () => 6 * 60, outreachPhaseAt: () => 'outreach_send' }))
vi.mock('@/lib/ops/missed-runs', () => ({ recordMissedRuns: async () => ({ written: 0 }) }))
vi.mock('@/lib/outreach/dns-check', () => ({ recordSendingDomainCheck: async () => 'not run' }))
vi.mock('@/lib/crm/tasks', () => ({ syncGrowthTasks: async () => ({}) }))
vi.mock('@/lib/outreach/twenty-drafts', () => ({
  TWENTY_ADVICE_DRAFTING: false,
  draftTheTwenty: async () => ({}),
  founderAccount: async () => ({ id: null, why: 'stood in' }),
  storeSegmentALetters: async () => [],
}))
vi.mock('@/lib/outreach/follow-ups', () => ({ draftDay4FollowUps: async () => ({}), draftDay10FollowUps: async () => ({}) }))
vi.mock('@/lib/outreach/sent-sync', () => ({ syncSentItems: async () => ({}) }))
vi.mock('@/lib/social/three-posts', () => ({ draftTheSpotlight: async () => ({}) }))
vi.mock('@/lib/outreach/basis-pool', () => ({
  basisPoolStore: () => ({}),
  POOL_HOUR: 23,
  POOL_MINUTE_FROM: 30,
  poolCapFor: () => 12,
  runBasisPool: async () => ({}),
  weekFirstLetters: async () => 0,
}))

import { GET } from '@/app/api/cron/outreach-run/route'

const req = { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? 'Bearer sekret' : null) } } as unknown as NextRequest

beforeEach(() => {
  h.throwInboxOf = null
  h.throwPlays = false
  h.throwJudging = false
  h.calls = []
  h.phase = []
  process.env.CRON_SECRET = 'sekret'
})

describe('one failure is contained; the outreach run goes on', () => {
  test("one mailbox's read throws: the other mailbox is read, the plays are planned and the sender sends", async () => {
    h.throwInboxOf = 'lawal@eventlinqs.com'
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inbox['lawal@eventlinqs.com']).toEqual({ error: 'Graph 503 for lawal@eventlinqs.com', step: 'the inbox of lawal@eventlinqs.com' })
    expect(h.calls).toContain('handled hello@eventlinqs.com')
    expect(h.calls).toEqual(expect.arrayContaining(['judged', 'planned', 'dms', 'partners', 'sender']))
    expect(body.faults).toEqual([{ error: 'Graph 503 for lawal@eventlinqs.com', step: 'the inbox of lawal@eventlinqs.com' }])
    expect(h.phase).toHaveLength(1)
    expect(h.phase[0].failed).toBe(true)
    expect(h.phase[0].result).toContain('contained: the inbox of lawal@eventlinqs.com: Graph 503 for lawal@eventlinqs.com')
  })

  test('the plays throw: the DMs, the partners and the sender still run', async () => {
    h.throwPlays = true
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plays).toEqual({ error: 'outreach_plays: boom', step: 'planning the plays' })
    expect(h.calls).toEqual(expect.arrayContaining(['dms', 'partners', 'sender']))
  })

  test('the judging throws: the plays are still planned and the sender still sends', async () => {
    h.throwJudging = true
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(h.calls).toEqual(expect.arrayContaining(['planned', 'sender']))
  })

  test('with nothing failing the run names no fault and its phase record is not failed', async () => {
    const res = await GET(req)
    const body = await res.json()
    expect(body.faults).toEqual([])
    expect(h.phase[0].failed).toBe(false)
  })
})
