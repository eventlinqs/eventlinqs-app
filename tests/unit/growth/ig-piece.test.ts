import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * /ig?piece=<id>, ONE PIECE'S OWN NIGHTS (the PM's RETURN of 04:05 on 24 November 2026, comedy piece ed0c1dca: after
 * posting, its link landed on /city/melbourne, every Melbourne night, where its three shows had to be hunted for).
 * src/lib/growth/ig.ts readIgPiecePage, driven through its own reads: the piece's NEWEST revision names the nights; only
 * those are read; each listing once at its soonest night still ahead, in date order, on the marketplace's card, tagged for
 * the network the visitor came from. The database and the card are stand ins; the rules are the real ones (ig-math.ts).
 */

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({ revisions: [] as Record<string, unknown>[], events: [] as Record<string, unknown>[], askedIds: [] as string[][] }))

function chain(rows: () => Row[], onIn?: (ids: string[]) => void) {
  const filters: ((r: Row) => boolean)[] = []
  let order: { k: string; asc: boolean } | null = null
  let lim = Infinity
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    in: (k: string, vs: string[]) => (onIn?.(vs), filters.push((r) => vs.includes(String(r[k]))), q),
    order: (k: string, o?: { ascending?: boolean }) => ((order = { k, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((lim = n), q),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => {
          let out = rows().filter((r) => filters.every((f) => f(r)))
          const by = order as { k: string; asc: boolean } | null
          if (by) out = [...out].sort((a, b) => (Number(a[by.k]) - Number(b[by.k])) * (by.asc ? 1 : -1))
          return { data: out.slice(0, lim), error: null }
        })
        .then(ok, bad),
  }
  return q
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/env', () => ({ getSupabaseServiceRoleKey: () => 'service-role' }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => chain(() => (t === 'social_piece_revisions' ? h.revisions : [])) }) }))
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => ({ from: () => chain(() => h.events, (ids) => h.askedIds.push(ids)) }) }))
vi.mock('@/lib/events/public-visibility', () => ({ applyPublicEventVisibility: (q: unknown) => q }))
vi.mock('@/lib/events/guide-queries', () => ({ GUIDE_SELECT: '*' }))
vi.mock('@/lib/images/venue-photo-chain', () => ({ withVenuePhotos: async (rows: unknown[]) => rows }))
vi.mock('@/lib/events/discovery-data', () => ({ discoveryData: async (rows: unknown[]) => ({ rows, days: { todayKey: '2026-11-23' } }) }))
vi.mock('@/lib/home/market-cards', () => ({
  marketCard: (e: { row: { id: string; slug: string; title: string }; more: number }) => ({ id: e.row.id, href: `/events/${e.row.slug}`, title: e.row.title, more: e.more }),
}))

const { readIgPiecePage } = await import('@/lib/growth/ig')

const NOW = new Date('2026-11-23T05:00:00.000Z')
const PIECE = 'ed0c1dca-0000-4000-8000-000000000001'
const OTHER = 'ed0c1dca-0000-4000-8000-000000000002'
const night = (id: string, slug: string, title: string, start: string, venue = 'Comedy Republic'): Row => ({
  id, slug, title, venue_name: venue, start_date: start, end_date: new Date(Date.parse(start) + 3_600_000).toISOString(), timezone: 'Australia/Melbourne', is_test: false,
})

beforeEach(() => {
  h.askedIds.length = 0
  h.events = [
    night('a1', 'improv-fri', 'Holy Sh!t Improv', '2026-11-27T06:00:00.000Z'),
    night('a2', 'improv-sat', 'Holy Sh!t Improv', '2026-11-28T07:30:00.000Z'),
    night('b1', 'main-stage-thu', 'Comedy Republic Main Stage', '2026-11-26T09:00:00.000Z'),
    night('c1', 'passed', 'Last Week', '2026-11-20T09:00:00.000Z'),
    night('d1', 'another-post', 'Another Post Night', '2026-11-27T09:00:00.000Z', 'The JazzLab'),
  ]
  h.revisions = [
    { piece_id: PIECE, version: 1, event_ids: ['a1'], versions: { instagram: { hook: '\u{1F602} An older drawing.' } } },
    { piece_id: PIECE, version: 2, event_ids: ['a2', 'c1', 'a1', 'b1'], versions: { instagram: { hook: '\u{1F602} Three shows at Comedy Republic, Friday 27 to Sunday 29 November.' } } },
    { piece_id: OTHER, version: 3, event_ids: ['d1'], versions: { instagram: { hook: '\u{1F3B6} Another post.' } } },
  ]
})

describe('readIgPiecePage', () => {
  it("lists exactly its newest revision's nights still ahead, each listing once, in date order, never another post's", async () => {
    const page = await readIgPiecePage(PIECE, 'facebook', NOW)
    expect(page.heading).toBe('Three shows at Comedy Republic, Friday 27 to Sunday 29 November')
    expect(page.items.map((i) => [i.card.title, (i.card as unknown as { more: number }).more])).toEqual([
      ['Comedy Republic Main Stage', 0],
      ['Holy Sh!t Improv', 1],
    ])
    // Only its own nights are read, and each card leads to its own event page, tagged for the network it came from.
    expect(h.askedIds).toEqual([['a2', 'c1', 'a1', 'b1']])
    expect(page.items.map((i) => i.href)).toEqual([
      `/events/main-stage-thu?utm_source=facebook&utm_medium=social&utm_campaign=ig&utm_content=${PIECE}`,
      `/events/improv-fri?utm_source=facebook&utm_medium=social&utm_campaign=ig&utm_content=${PIECE}`,
    ])
  })

  it('a piece no revision names gives no heading and no item', async () => {
    expect(await readIgPiecePage('ed0c1dca-0000-4000-8000-00000000dead', 'instagram', NOW)).toEqual({ heading: null, items: [] })
    expect(h.askedIds).toEqual([])
  })

  it('a piece whose nights have all passed keeps its heading and lists nothing', async () => {
    h.revisions = [{ piece_id: PIECE, version: 1, event_ids: ['c1'], versions: { instagram: { hook: '\u{1F602} Last week.' } } }]
    expect(await readIgPiecePage(PIECE, 'instagram', NOW)).toEqual({ heading: 'Last week', items: [] })
  })
})
