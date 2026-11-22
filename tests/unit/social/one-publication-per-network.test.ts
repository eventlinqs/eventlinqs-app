import { describe, expect, it } from 'vitest'
import { publishDuePieces } from '@/lib/social/store'

/*
 * ONE PUBLICATION PER MOMENT PER NETWORK (Lawal's hardening order of 22 November 2026, section 3 and test 6; the PM's
 * 09:55 item 2: keyed on event, event day, platform, type and occurrence, never on the approval). 5C's reconciliation of
 * 22 November, 09:39 (engine-proof/reconcile.md, part C): c126bbf0 went to Facebook three times and 31d92f7e twice, each
 * under a later approval, because no submission id was kept to warn the next run. Each later schedule is held with the
 * earlier post's reference and the provider is never called; so is a piece redrawn for the same moment. Red on main
 * a4c40783 and ddac8595: each was sent.
 */
type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>) {
  const updates: Row[] = []
  const db = {
    from: (table: string) => {
      const tests: ((r: Row) => boolean)[] = []
      let payload: Row | null = null
      let one = false
      let cap = Infinity
      const run = () => {
        if (payload) return (updates.push({ table, ...payload }), { error: null })
        if (table === 'feature_flags') return { data: one ? { enabled: true } : [{ enabled: true }], error: null }
        const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r))).slice(0, cap)
        return one ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Row) => ((payload = p), q),
        eq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) === String(v)), q),
        neq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) !== String(v)), q),
        in: (k: string, vs: unknown[]) => (tests.push((r) => vs.map(String).includes(String(r[k]))), q),
        lte: () => q,
        not: () => q,
        order: () => q,
        limit: (n: number) => ((cap = n), q),
        maybeSingle: () => ((one = true), q),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
      }
      return q
    },
  }
  return { db: db as never, updates }
}

const ORIGIN = 'https://www.eventlinqs.com.au'
const neverSent = async (db: never, now: Date) => {
  let sent = 0
  const out = await publishDuePieces(db, now, { siteOrigin: ORIGIN, publisher: async () => (sent++, { ref: 'x', submission: null }) as never, reader: null })
  return { out, sent }
}

describe('one publication per moment per network', () => {
  it("c126bbf0's third Facebook schedule (approval 3), its first already published: held, never sent", async () => {
    const earlier = 'https://facebook.com/1115963901604820_122160180117350955'
    const t = fakeDb({
      social_piece_schedules: [
        { id: '3dec003d', piece_id: 'c126bbf0', approval_id: 'a1', platform: 'facebook', state: 'published', published_ref: earlier, go_at: '2026-11-17T19:11:00Z' },
        { id: 'f85bc5cc', piece_id: 'c126bbf0', approval_id: 'a3', platform: 'facebook', state: 'scheduled', published_ref: null, go_at: '2026-11-19T07:40:00Z' },
      ],
      social_pieces: [{ id: 'c126bbf0', moment_key: null }],
    })
    const { out, sent } = await neverSent(t.db, new Date('2026-11-19T07:45:00Z'))
    expect(sent).toBe(0)
    expect(out.held.join(' ')).toContain(`already published on facebook (${earlier})`)
    expect(t.updates).toEqual([expect.objectContaining({ table: 'social_piece_schedules', state: 'held' })])
  })

  it("31d92f7e's second Facebook schedule (approval 2), its first already published: held, never sent", async () => {
    const earlier = 'https://facebook.com/1115963901604820_122160179577350955'
    const t = fakeDb({
      social_piece_schedules: [
        { id: '649488cc', piece_id: '31d92f7e', approval_id: 'a1', platform: 'facebook', state: 'published', published_ref: earlier, go_at: '2026-11-17T19:08:00Z' },
        { id: '7f4fe242', piece_id: '31d92f7e', approval_id: 'a2', platform: 'facebook', state: 'scheduled', published_ref: null, go_at: '2026-11-17T22:11:00Z' },
      ],
      social_pieces: [{ id: '31d92f7e', moment_key: null }],
    })
    const { out, sent } = await neverSent(t.db, new Date('2026-11-17T22:15:00Z'))
    expect(sent).toBe(0)
    expect(out.held.join(' ')).toContain(`already published on facebook (${earlier})`)
  })

  it('a piece redrawn for the same moment (a new id, the same event, day, type and occurrence): held, never sent again', async () => {
    const moment = 'final_day|feed|2026-11-22|t:african music and cultural festival 2026|0d7a0801-e265-4920-96e1-94838ae52e7e|2026-11-20'
    const t = fakeDb({
      social_piece_schedules: [
        { id: 'old-ig', piece_id: 'first-draw', approval_id: 'a1', platform: 'instagram', state: 'published', published_ref: 'https://www.instagram.com/p/AbC123/', go_at: '2026-11-22T00:40:00Z' },
        { id: 'new-ig', piece_id: 'redrawn', approval_id: 'a9', platform: 'instagram', state: 'scheduled', published_ref: null, go_at: '2026-11-22T07:00:00Z' },
      ],
      social_pieces: [{ id: 'first-draw', moment_key: moment }, { id: 'redrawn', moment_key: moment }],
    })
    const { out, sent } = await neverSent(t.db, new Date('2026-11-22T07:05:00Z'))
    expect(sent).toBe(0)
    expect(out.held.join(' ')).toContain('already published on instagram (https://www.instagram.com/p/AbC123/)')
  })

  it("the same moment on the other network is not held: Facebook is its own publication", async () => {
    const t = fakeDb({
      social_piece_schedules: [
        { id: 'old-ig', piece_id: 'p1', approval_id: 'a1', platform: 'instagram', state: 'published', published_ref: 'https://www.instagram.com/p/AbC123/', go_at: '2026-11-22T00:40:00Z' },
        { id: 'fb', piece_id: 'p1', approval_id: 'a1', platform: 'facebook', state: 'scheduled', published_ref: null, go_at: '2026-11-22T07:00:00Z' },
      ],
      social_pieces: [{ id: 'p1', moment_key: null }],
    })
    const { out } = await neverSent(t.db, new Date('2026-11-22T07:05:00Z'))
    expect(out.held.join(' ')).not.toContain('already published')
  })
})
