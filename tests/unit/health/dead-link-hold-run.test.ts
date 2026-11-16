import { describe, expect, it } from 'vitest'
import { holdDeadNights } from '@/lib/health/visitor-sentinel-run'
import { SENTINEL_HOLD_MARK } from '@/lib/health/dead-link-hold'

/*
 * THE AUTOMATIC HOLD'S WRITES (the PM's 12:15 item 3 of 16 November 2026), driven through the sentinel's own run with a
 * database fake that records every write. A drill on TEST waits for TEST to carry listing_holds (TEST is behind production:
 * 20261107120001 and 20261107170001 not applied there, read 12:38 on 16 November).
 */
type Write = { table: string; op: 'insert' | 'update'; values: Record<string, unknown>; where: [string, unknown][] }

function fakeDb(links: Record<string, unknown>[], holds: Record<string, unknown>[], sources: Record<string, unknown>[] = []) {
  const writes: Write[] = []
  const from = (table: string) => {
    const state: { op: 'select' | 'insert' | 'update'; values: Record<string, unknown>; where: [string, unknown][] } = { op: 'select', values: {}, where: [] }
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => (state.where.push([k, v]), b),
      gte: () => b,
      is: (k: string, v: unknown) => (state.where.push([k, v]), b),
      limit: () => b,
      insert: (values: Record<string, unknown>) => ((state.op = 'insert'), (state.values = values), b),
      update: (values: Record<string, unknown>) => ((state.op = 'update'), (state.values = values), b),
      then: (resolve: (r: { data: unknown; error: null }) => unknown) => {
        if (state.op !== 'select') writes.push({ table, op: state.op, values: state.values, where: state.where })
        if (state.op === 'insert' && table === 'listing_holds') holds.push({ id: `new-${holds.length}`, ...state.values, held_at: NOW.toISOString() })
        const data = state.op !== 'select' ? null : table === 'event_booking_links' ? links : table === 'listing_holds' ? holds : table === 'listing_sources' ? sources : []
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return b
  }
  return { db: { from } as never, writes }
}

const NOW = new Date('2026-11-16T00:40:00Z')
const cannonball = { id: 'e1', slug: 'cannonball-featuring-chantal-mitvalsky-jl-room-the-jazzlab-2026-11-20', listing_series_id: 's1', visibility: 'public' }

describe("the sentinel's run holds and releases", () => {
  it('holds a public night dead on two runs: one hold row with its mark, the night made private, named in the results', async () => {
    const { db, writes } = fakeDb([{ url: 'https://thejazzlab.com.au/event/cannonball-featuring-chantal-mitvalsky-4/', availability: 'dead', updated_at: '2026-11-15T18:00:33Z', events: cannonball }], [])
    const results = await holdDeadNights(db, NOW, true)
    expect(writes.map((w) => `${w.table} ${w.op}`)).toEqual(['listing_holds insert', 'events update'])
    expect(writes[0].values).toMatchObject({ event_id: 'e1', scope: 'night', reason: 'no_official_page' })
    expect(writes[1]).toMatchObject({ values: { visibility: 'private' }, where: [['id', 'e1'], ['visibility', 'public']] })
    const held = results.find((r) => r.id === 'visitor-held-dead-booking')
    expect(held).toMatchObject({ ok: false, severity: 'critical' })
    expect(held?.detail).toContain(cannonball.slug)
  })

  it('a dry run writes nothing and says what it would hold', async () => {
    const { db, writes } = fakeDb([{ url: 'https://x.example/a', availability: 'dead', updated_at: '2026-11-15T18:00:33Z', events: cannonball }], [])
    const results = await holdDeadNights(db, NOW, false)
    expect(writes).toEqual([])
    expect(results.find((r) => r.id === 'visitor-held-dead-booking')?.label).toMatch(/would hold/)
  })

  it("releases its own hold when a link answers again, and the night is public again; never another's hold", async () => {
    const live = [{ url: 'https://x.example/a', availability: 'on_sale', updated_at: NOW.toISOString(), events: { ...cannonball, visibility: 'private' } }]
    const mine = [{ id: 'h1', event_id: 'e1', readings: [{ by: SENTINEL_HOLD_MARK }] }]
    const { db, writes } = fakeDb(live, mine)
    await holdDeadNights(db, NOW, true)
    expect(writes.map((w) => `${w.table} ${w.op}`)).toEqual(['listing_holds update', 'events update'])
    expect(writes[0].values).toMatchObject({ released_by: 'visitor-sentinel: a booking link answers again' })
    expect(writes[1].values).toEqual({ visibility: 'public' })
    const theirs = fakeDb(live, [{ id: 'h2', event_id: 'e1', readings: [{ by: 'WINDOW 5A, polite reader' }] }])
    await holdDeadNights(theirs.db, NOW, true)
    expect(theirs.writes).toEqual([])
  })

  // THE PM'S 12:25 ITEMS 1 AND 3 (Lawal's 12:21: 'never repeat the same errors ever').
  it("re-reads every night on a dead night's host at once, and judges what it reads: a link that answers is not held", async () => {
    const links = [{ url: 'https://thejazzlab.com.au/event/cannonball-featuring-chantal-mitvalsky-4/', availability: 'dead', updated_at: '2026-11-15T18:00:33Z', events: cannonball }]
    const { db, writes } = fakeDb(links, [])
    const seen: string[][] = []
    await holdDeadNights(db, NOW, true, { reread: async (hosts) => { seen.push([...hosts]); links[0].availability = 'on_sale' } })
    expect(seen).toEqual([['thejazzlab.com.au']])
    expect(writes).toEqual([])
  })

  it('a host whose links died on two nights within a week has its read source switched off, said in the email', async () => {
    const earlier = { id: 'h0', event_id: 'e0', scope: 'night', readings: [{ by: SENTINEL_HOLD_MARK, url: 'https://thejazzlab.com.au/event/an-earlier-night/' }], held_at: '2026-11-14T00:40:00Z' }
    const sources = [{ id: 's1', name: 'The JazzLab', page_url: 'https://thejazzlab.com.au/whats-on/', collection: 'read' }]
    const { db, writes } = fakeDb([{ url: 'https://thejazzlab.com.au/event/cannonball-featuring-chantal-mitvalsky-4/', availability: 'dead', updated_at: '2026-11-15T18:00:33Z', events: cannonball }], [earlier], sources)
    const results = await holdDeadNights(db, NOW, true)
    expect(writes.map((w) => `${w.table} ${w.op}`)).toEqual(['listing_holds insert', 'events update', 'listing_sources update'])
    expect(writes[2]).toMatchObject({ values: { collection: 'ask' }, where: [['id', 's1'], ['collection', 'read']] })
    expect(String(writes[2].values.stopped_because)).toContain('dead on 2 nights within 7 days')
    expect(results.find((r) => r.id === 'visitor-source-stopped-dead-links')).toMatchObject({ ok: false, detail: expect.stringContaining('The JazzLab') })
  })
})
