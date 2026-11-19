/*
 * A WHOLE READ OF A LIST THAT STILL DOES NOT CARRY A HELD NIGHT IS WRITTEN ON ITS HOLD (main's engine verifier on e5b4b6e08,
 * 19 November 2026: 'FAIL open hold ddc9d602 (Humanoid Fighting Championship): its next check ... is more than a day
 * overdue'). The collection run re-read Margaret Court Arena's list that day, but the held night is private, so the re-read
 * left no trace on the hold. src/lib/listings/left-source-store.ts leftSourceRereads decides; recordLeftSourceRereads writes.
 */
import { describe, expect, it } from 'vitest'
import { leftSourceRereads, recordLeftSourceRereads, type LeftHold } from '@/lib/listings/left-source-store'

const LIST = 'https://margaretcourtarena.com.au/events/'
const at = new Date('2026-11-19T00:25:21.572Z')
const first = { url: LIST, read: 'the list no longer carries this night', read_at: '2026-11-17T06:25:21.297Z', by: 'collection run, source 12c2e416' }
const humanoid: LeftHold = { id: 'ddc9d602', eventId: 'ev-humanoid', readings: [first] }

describe('a held night still off its list is written as read again', () => {
  it('adds the reading and moves the next check a day on', () => {
    const [w] = leftSourceRereads([humanoid], { sourceId: '12c2e416', listUrl: LIST, carried: new Set(['ev-other']), at })
    expect(w.id).toBe('ddc9d602')
    expect(w.nextCheckAt).toBe('2026-11-20T00:25:21.572Z')
    expect(w.readings).toHaveLength(2)
    expect(w.readings[1]).toMatchObject({ url: LIST, read: 'read again: the list still does not carry this night', read_at: at.toISOString() })
  })

  it('the drill: a night the list carries again is not written here (releaseLeftSource releases it)', () => {
    expect(leftSourceRereads([humanoid], { sourceId: '12c2e416', listUrl: LIST, carried: new Set(['ev-humanoid']), at })).toEqual([])
  })

  it('keeps the first reading and the newest six, a week of daily reads', () => {
    const many: LeftHold = { ...humanoid, readings: [first, ...Array.from({ length: 9 }, (_, i) => ({ read_at: `day ${i}` }))] }
    const [w] = leftSourceRereads([many], { sourceId: '12c2e416', listUrl: LIST, carried: new Set(), at })
    expect(w.readings).toHaveLength(7)
    expect(w.readings[0]).toBe(first)
    expect(w.readings[6]).toMatchObject({ read_at: at.toISOString() })
  })

  it('writes each one on production, only on an open hold, and says how many', async () => {
    const updates: { patch: Record<string, unknown>; where: [string, unknown][] }[] = []
    const db = {
      from: () => ({
        select: () => {
          const q = { eq: () => q, is: async () => ({ data: [{ id: 'ddc9d602', event_id: 'ev-humanoid', readings: [first] }, { id: 'h2', event_id: 'ev-back', readings: [] }], error: null }) }
          return q
        },
        update: (patch: Record<string, unknown>) => {
          const where: [string, unknown][] = []
          updates.push({ patch, where })
          const q = { eq: (k: string, v: unknown) => (where.push([k, v]), q), is: async (k: string, v: unknown) => (where.push([k, v]), { error: null }) }
          return q
        },
      }),
    }
    const n = await recordLeftSourceRereads(db as never, { sourceId: '12c2e416', listUrl: LIST, carried: new Set(['ev-back']), at })
    expect(n).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].where).toEqual([['id', 'ddc9d602'], ['released_at', null]])
    expect(updates[0].patch.next_check_at).toBe('2026-11-20T00:25:21.572Z')
  })
})
