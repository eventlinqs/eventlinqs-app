import { describe, expect, it } from 'vitest'
import { matchHeld, MAY_HAVE_GONE, reconcileHeld } from '@/lib/social/reconcile'

/*
 * THE READ ONLY BLOTATO RECONCILE (the PM's 09:55 of 22 November 2026, item 2). The five Instagram rows of 18 November
 * were held with 'violates check constraint social_piece_schedules_published_ref_check' after Blotato accepted them; the
 * reconcile matches each to Blotato's own published posts by its approved caption within a day of its slot, and writes
 * nothing.
 */
const HELD_REASON = 'Sent as blotato:x; the database refused that reference: new row for relation "social_piece_schedules" violates check constraint "social_piece_schedules_published_ref_check"'
const CAPTION = 'Three nights worth planning for in Geelong.\n\nAll of it: eventlinqs.com.au/city/geelong'

describe('a held row is matched to what Blotato says it posted', () => {
  it('one post with its caption within a day of its slot: its address', () => {
    const out = matchHeld({ caption: CAPTION, slot: '2026-11-17T19:08:00Z' }, [
      { content: CAPTION, postUrl: 'https://www.instagram.com/p/Abc/', createdAt: '2026-11-17T19:09:12Z' },
      { content: 'Something else entirely.', postUrl: 'https://www.instagram.com/p/Zzz/', createdAt: '2026-11-17T19:10:00Z' },
    ])
    expect(out).toEqual({ found: 'one', postUrls: ['https://www.instagram.com/p/Abc/'] })
  })

  it('none, or the same caption a week away: none; two: more than one, never a guess', () => {
    expect(matchHeld({ caption: CAPTION, slot: '2026-11-17T19:08:00Z' }, [{ content: CAPTION, postUrl: 'u', createdAt: '2026-11-25T19:08:00Z' }]).found).toBe('none')
    expect(matchHeld({ caption: CAPTION, slot: '2026-11-17T19:08:00Z' }, [
      { content: CAPTION, postUrl: 'a', createdAt: '2026-11-17T19:09:00Z' },
      { content: CAPTION, postUrl: 'b', createdAt: '2026-11-17T21:09:00Z' },
    ]).found).toBe('more than one')
    expect(MAY_HAVE_GONE.test(HELD_REASON)).toBe(true)
    expect(MAY_HAVE_GONE.test('Not published: [night] it has started')).toBe(false)
  })

  it('reads the held rows, their approved caption and Blotato once per network, and writes nothing', async () => {
    const writes: string[] = []
    const tables: Record<string, Record<string, unknown>[]> = {
      social_piece_schedules: [
        { id: 'dde4e255', piece_id: '51555d61', approval_id: 'a1', platform: 'instagram', go_at: '2026-11-17T19:08:00Z', held_reason: HELD_REASON, state: 'held', published_ref: null },
        { id: 'other', piece_id: 'p2', approval_id: 'a2', platform: 'instagram', go_at: '2026-11-17T19:08:00Z', held_reason: 'Not published: [night] it has started', state: 'held', published_ref: null },
      ],
      social_piece_approvals: [{ id: 'a1', revision: 2 }],
      social_piece_revisions: [{ piece_id: '51555d61', version: 2, caption: CAPTION, versions: { instagram: { caption: CAPTION } } }],
    }
    const db = {
      from: (table: string) => {
        const tests: ((r: Record<string, unknown>) => boolean)[] = []
        let one = false
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) === String(v)), q),
          is: (k: string, v: unknown) => (tests.push((r) => r[k] === v), q),
          maybeSingle: () => ((one = true), q),
          update: () => (writes.push(table), q),
          insert: () => (writes.push(table), q),
          then: (ok: (v: unknown) => unknown) => {
            const rows = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
            return Promise.resolve(ok(one ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }))
          },
        }
        return q
      },
    }
    let asked = 0
    const search = async () => (asked++, [{ content: CAPTION, postUrl: 'https://www.instagram.com/p/Abc/', createdAt: '2026-11-17T19:09:12Z' }])
    const out = await reconcileHeld(db as never, search)
    expect(out).toEqual([{ schedule: 'dde4e255', piece: '51555d61', platform: 'instagram', slot: '2026-11-17T19:08:00Z', found: 'one', postUrls: ['https://www.instagram.com/p/Abc/'] }])
    expect(asked).toBe(1)
    expect(writes).toEqual([])
  })
})
