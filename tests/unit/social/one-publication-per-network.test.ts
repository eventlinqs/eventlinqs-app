import { describe, expect, it } from 'vitest'
import { publishDuePieces } from '@/lib/social/store'

/*
 * ONE PUBLICATION PER PIECE PER NETWORK (Lawal's hardening order of 22 November 2026, section 3 and test 6: a repeated
 * run never duplicates a post). 5C's reconciliation of 22 November, 09:39 (engine-proof/reconcile.md, part C): piece
 * c126bbf0 went to Facebook three times and 31d92f7e twice, each under a later approval, because no submission id was
 * ever kept to warn the next run. Here c126bbf0's third Facebook schedule falls due while an earlier one is published:
 * it is held with the earlier post's reference, and the provider is never called. Red on main a4c40783: it was sent.
 */
const NOW = new Date('2026-11-19T07:45:00Z')
const EARLIER = 'https://facebook.com/1115963901604820_122160180117350955'

function fakeDb(publishedBefore: boolean) {
  const updates: Record<string, unknown>[] = []
  const due = [{ id: 'f85bc5cc', piece_id: 'c126bbf0', approval_id: 'a3', platform: 'facebook', go_at: '2026-11-19T07:40:00Z' }]
  const db = {
    from: (table: string) => {
      let cols = ''
      let payload: Record<string, unknown> | null = null
      const q: Record<string, unknown> = {
        select: (c: string) => ((cols = c), q),
        update: (p: Record<string, unknown>) => ((payload = p), q),
        eq: () => q,
        neq: () => q,
        lte: () => q,
        not: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: table === 'feature_flags' ? { enabled: true } : null, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (payload) return (updates.push({ table, ...payload }), Promise.resolve(ok({ error: null })))
          if (table === 'social_piece_schedules' && cols.startsWith('id, piece_id')) return Promise.resolve(ok({ data: due, error: null }))
          if (table === 'social_piece_schedules' && cols === 'id, published_ref') return Promise.resolve(ok({ data: publishedBefore ? [{ id: '649488cc', published_ref: EARLIER }] : [], error: null }))
          return Promise.resolve(ok({ data: [], error: null }))
        },
      }
      return q
    },
  }
  return { db: db as never, updates }
}

describe('one publication per piece per network', () => {
  it("c126bbf0's third Facebook schedule, an earlier one published: held with that post's reference, never sent", async () => {
    const { db, updates } = fakeDb(true)
    let sent = 0
    const out = await publishDuePieces(db, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher: async () => (sent++, { ref: 'x', submission: null }) as never, reader: null })
    expect(sent).toBe(0)
    expect(out.published).toEqual([])
    expect(out.held.join(' ')).toMatch(new RegExp(`already published on facebook \\(${EARLIER.replace(/[.]/g, '\\.')}\\)`))
    expect(updates).toEqual([expect.objectContaining({ table: 'social_piece_schedules', state: 'held' })])
  })
})
