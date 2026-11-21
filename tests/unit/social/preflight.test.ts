import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allWell, morningRows, type MorningFacts } from '@/lib/admin/morning-report-math'
import { nothingCanPostReason, preflightLine } from '@/lib/social/preflight-line'

/*
 * THE PRE FLIGHT AND THE ONE NOTICE (the PM's 16:30 of 21 November 2026, items 2 and 4; AV (c) and (g)). Every piece due
 * today meets its checks before the 06:40 run; a refused one is rejected and held so the planner draws the next best
 * moment; the 08:00 report carries 'today: N pieces ready, M redrawn, K nights with no permitted photo', and says that
 * nothing can post, with why, only on a day when nothing can.
 */
const hoisted = vi.hoisted(() => ({
  dry: [] as { id: string; label: string; eligible: boolean; reasons: string[] }[],
  issues: new Map<string, string[]>(),
  rejected: [] as { pieceId: string; reason: string }[],
  plan: { pieces: [] as unknown[], notes: [] as string[], due: 0, photoless: [] as string[] },
}))
vi.mock('@/lib/social/store', () => ({
  standingPolicyDryRun: async () => hoisted.dry,
  pieceDependencies: async (_db: unknown, id: string) => hoisted.issues.get(id) ?? [],
  rejectPiece: async (_db: unknown, i: { pieceId: string; reason: string }) => (hoisted.rejected.push(i), { state: 'done' }),
  readLifecycleNights: async () => [],
}))
vi.mock('@/lib/social/lifecycle-plan', async (original) => ({
  ...(await original<typeof import('@/lib/social/lifecycle-plan')>()),
  planLifecyclePieces: async () => hoisted.plan,
}))

const NOW = new Date('2026-11-21T17:40:00Z') // 04:40, Sunday 22 November, Melbourne
function fakeDb(pieces: { id: string; moment_key: string }[], scheduled: { piece_id: string }[]) {
  const holds: { change: Record<string, unknown>; where: [string, unknown][] }[] = []
  const audits: Record<string, unknown>[] = []
  const query = (table: string) => {
    const where: [string, unknown][] = []
    let change: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {
      select: () => q, in: () => q, gte: () => q, lt: () => q, limit: () => q,
      eq: (k: string, v: unknown) => (where.push([k, v]), q),
      update: (c: Record<string, unknown>) => ((change = c), q),
      insert: async (row: Record<string, unknown>) => (audits.push(row), { error: null }),
      then: (ok: (v: unknown) => unknown) => {
        if (change) return Promise.resolve((holds.push({ change, where }), { error: null })).then(ok)
        return Promise.resolve({ data: table === 'social_pieces' ? pieces : scheduled, error: null }).then(ok)
      },
    }
    return q
  }
  return { db: { from: (t: string) => query(t) } as never, holds, audits }
}

beforeEach(() => {
  hoisted.dry = []
  hoisted.issues = new Map()
  hoisted.rejected = []
  hoisted.plan = { pieces: [], notes: [], due: 0, photoless: [] }
})

describe('the pre-flight', () => {
  it("counts today's ready pieces, redraws each refused one, and records the 08:00 line", async () => {
    const { runPreflight } = await import('@/lib/social/preflight')
    hoisted.dry = [
      { id: 'amcf', label: 'AMCF final day feed', eligible: true, reasons: [] },
      { id: 'colours', label: 'Colours of Asia tomorrow story', eligible: false, reasons: ['its next free band is after its night starts.'] },
      { id: 'next-week', label: 'A piece for another day', eligible: false, reasons: ['x'] },
    ]
    hoisted.issues.set('sched-1', ['LANY: its ticket page answers 403.'])
    hoisted.plan = { pieces: [{}], notes: [], due: 3, photoless: ['A night with no photo'] }
    const t = fakeDb(
      [
        { id: 'amcf', moment_key: 'final_day|feed|2026-11-22|r1' },
        { id: 'colours', moment_key: 'tomorrow|story|2026-11-22|r2' },
        { id: 'next-week', moment_key: 'announce|feed|2026-11-23|r3' },
      ],
      [{ piece_id: 'sched-1' }, { piece_id: 'sched-2' }],
    )
    const p = await runPreflight(t.db, { now: NOW, siteOrigin: 'https://www.eventlinqs.com.au', apply: true, by: 'founder-1' })
    expect(p.line).toBe('today: 2 pieces ready, 2 redrawn, 1 nights with no permitted photo')
    expect(hoisted.rejected.map((r) => r.pieceId)).toEqual(['colours', 'sched-1'])
    expect(t.holds.map((h) => h.change.state)).toEqual(['held', 'held'])
    expect(p.nothingCanPost).toBeNull()
    expect(t.audits[0]).toMatchObject({ action: 'system.social.preflight', metadata: expect.objectContaining({ line: p.line }) })
  })

  it('a dry run writes nothing', async () => {
    const { runPreflight } = await import('@/lib/social/preflight')
    hoisted.dry = [{ id: 'colours', label: 'Colours', eligible: false, reasons: ['no band'] }]
    const t = fakeDb([{ id: 'colours', moment_key: 'tomorrow|story|2026-11-22|r2' }], [])
    const p = await runPreflight(t.db, { now: NOW, siteOrigin: 'https://www.eventlinqs.com.au', apply: false, by: null })
    expect(p.redrawn).toHaveLength(1)
    expect(hoisted.rejected).toEqual([])
    expect(t.holds).toEqual([])
    expect(t.audits).toEqual([])
  })

  it('a day with nothing that can post says so, with the reason', async () => {
    const { runPreflight } = await import('@/lib/social/preflight')
    hoisted.plan = { pieces: [], notes: [], due: 2, photoless: ['Night A', 'Night B'] }
    const t = fakeDb([], [])
    const p = await runPreflight(t.db, { now: NOW, siteOrigin: 'https://www.eventlinqs.com.au', apply: true, by: 'founder-1' })
    expect(p.nothingCanPost).toBe('no night with a moment due today has a permitted photograph (Night A, Night B)')
  })
})

describe('the words', () => {
  it('the line, and the reason only when nothing can post', () => {
    expect(preflightLine({ ready: 3, redrawn: 1, photoless: 2 })).toBe('today: 3 pieces ready, 1 redrawn, 2 nights with no permitted photo')
    expect(nothingCanPostReason({ ready: 1, wouldDraw: 0, due: 1, photoless: [], notes: [] })).toBeNull()
    expect(nothingCanPostReason({ ready: 0, wouldDraw: 0, due: 0, photoless: [], notes: [] })).toBe('no night has a moment due today')
    expect(nothingCanPostReason({ ready: 0, wouldDraw: 0, due: 2, photoless: ['a'], notes: ['b c: passed over, no band'] })).toBe('b c: passed over, no band')
  })
})

describe('the 08:00 report', () => {
  const facts = (preflight: { line: string; nothingCanPost: string | null } | null): MorningFacts =>
    ({
      marketing: { firstLettersSent: 0, positiveReplies: 0, readyToday: 0, poolToday: null, businessDay: true },
      permissions: { requestsSent: 0, photosReceived: 0, photosApproved: 0, requestsDueToday: 0 },
      social: { published: [], scheduledToday: 1, held: 0, preflight },
      listings: { published: 0, ended: 0, onToday: 0 },
      relationships: { repliesReceived: 0, waitingForLawal: 0 },
      ticketing: { ordersConfirmed: 0, feeRevenueCents: 0, activations: 0 },
      system: { failures: [], unreadable: [] },
    }) as unknown as MorningFacts

  it('carries the line every day, and a sentence only when nothing can post', () => {
    const quiet = morningRows(facts({ line: 'today: 2 pieces ready, 0 redrawn, 1 nights with no permitted photo', nothingCanPost: null })).find((r) => r.area === 'Social Media Marketing')
    expect(quiet?.today).toContain('Pre-flight, today: 2 pieces ready, 0 redrawn, 1 nights with no permitted photo.')
    expect(quiet?.today).not.toContain('Nothing can post')
    const empty = facts({ line: 'today: 0 pieces ready, 0 redrawn, 2 nights with no permitted photo', nothingCanPost: 'no night with a moment due today has a permitted photograph (A, B)' })
    expect(morningRows(empty).find((r) => r.area === 'Social Media Marketing')?.today).toContain('Nothing can post today: no night with a moment due today has a permitted photograph (A, B).')
    expect(allWell(empty)).toBe(false)
  })
})
