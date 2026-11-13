import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { kitWentAt, readKitIdsSentByEmail, readKitTouchesSent } from '@/lib/social/kit-sent'

/*
 * WHEN A PARTNER KIT WENT (order 4, Release 2 item 9: "kit sent recorded apart from kit used"). A kit goes by hand
 * (marked sent) or by email (Lawal sends the message carrying its own link; the Sent Items sync records the touch as
 * 'sent'). It went at the earlier of the two; a draft, a held touch or a touch on another link never counts.
 */

type Row = Record<string, unknown>

/** A small PostgREST stand-in: eq, in, not is null, order and range, over plain rows; every request is recorded. */
function fakeDb(tables: Record<string, Row[]>) {
  const asked: { table: string; filters: string[] }[] = []
  const db = {
    from(table: string) {
      const filters: string[] = []
      const tests: ((r: Row) => boolean)[] = []
      asked.push({ table, filters })
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push(`eq ${c}=${String(v)}`), tests.push((r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => (filters.push(`in ${c}`), tests.push((r) => vs.includes(r[c])), q),
        not: (c: string, op: string, v: unknown) => (filters.push(`not ${c} ${op} ${String(v)}`), tests.push((r) => r[c] !== null && r[c] !== undefined), q),
        order: () => q,
        range: (from: number, to: number) =>
          Promise.resolve({ data: (tables[table] ?? []).filter((r) => tests.every((t) => t(r))).slice(from, to + 1), error: null }),
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, asked }
}

const KIT_A = 'https://www.eventlinqs.com.au/s/kitA'
const KIT_B = 'https://www.eventlinqs.com.au/s/kitB'

describe('kitWentAt', () => {
  it('a kit never marked and never sent has not gone', () => {
    expect(kitWentAt(null, null)).toBeNull()
  })
  it('either way alone counts', () => {
    expect(kitWentAt('2026-11-10T01:00:00.000Z', null)).toBe('2026-11-10T01:00:00.000Z')
    expect(kitWentAt(null, '2026-11-11T02:00:00.000Z')).toBe('2026-11-11T02:00:00.000Z')
  })
  it('both: it went at the earlier', () => {
    expect(kitWentAt('2026-11-12T00:00:00.000Z', '2026-11-11T02:00:00.000Z')).toBe('2026-11-11T02:00:00.000Z')
    expect(kitWentAt('2026-11-10T00:00:00.000Z', '2026-11-11T02:00:00.000Z')).toBe('2026-11-10T00:00:00.000Z')
  })
})

describe('readKitTouchesSent', () => {
  it('reads only touches Lawal sent, on the kits own links, the earliest per link', async () => {
    const { db, asked } = fakeDb({
      outreach_touches: [
        { id: '1', tracked_link: KIT_A, state: 'sent', sent_at: '2026-11-12T03:00:00+00:00' },
        { id: '2', tracked_link: KIT_A, state: 'sent', sent_at: '2026-11-11T03:00:00+00:00' },
        { id: '3', tracked_link: KIT_B, state: 'held', sent_at: null },
        { id: '4', tracked_link: 'https://www.eventlinqs.com.au/s/other', state: 'sent', sent_at: '2026-11-11T00:00:00+00:00' },
      ],
    })
    const sent = await readKitTouchesSent(db, [KIT_A, KIT_B, null, KIT_A])
    expect([...sent.entries()]).toEqual([[KIT_A, '2026-11-11T03:00:00.000Z']])
    expect(asked[0].table).toBe('outreach_touches')
    expect(asked[0].filters).toEqual(expect.arrayContaining(['eq state=sent', 'not sent_at is null', 'in tracked_link']))
  })

  it('asks nothing when there is no kit link', async () => {
    const { db, asked } = fakeDb({})
    expect((await readKitTouchesSent(db, [null])).size).toBe(0)
    expect(asked).toEqual([])
  })
})

describe('readKitIdsSentByEmail', () => {
  const pieces = [
    { id: 'p1', kind: 'partner_kit', link: KIT_A },
    { id: 'p2', kind: 'partner_kit', link: KIT_B },
    { id: 'p3', kind: 'week_ahead', link: KIT_A },
  ]
  const touches = [{ id: '1', tracked_link: KIT_A, state: 'sent', sent_at: '2026-11-11T03:00:00+00:00' }]

  it('names the partner kits sent by email, never another kind of piece on the same link', async () => {
    const { db } = fakeDb({ social_pieces: pieces, outreach_touches: touches })
    expect([...(await readKitIdsSentByEmail(db))]).toEqual(['p1'])
  })

  it('among named pieces only', async () => {
    const { db } = fakeDb({ social_pieces: pieces, outreach_touches: touches })
    expect([...(await readKitIdsSentByEmail(db, ['p2', 'p3']))]).toEqual([])
    expect([...(await readKitIdsSentByEmail(db, ['p1']))]).toEqual(['p1'])
  })
})
