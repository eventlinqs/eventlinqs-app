import { describe, expect, test } from 'vitest'
import { readRepoFile } from '../../helpers/read-repo-file'
import {
  RANKED_DIRECTORY_FUNCTION,
  fetchDirectoryArtistsRankedByDraw,
  fetchDrawTotalsForArtists,
} from '@/lib/marketplace/showcase'

/**
 * "STRONGEST DRAW FIRST" RANKED THE ALPHABETICALLY FIRST 48 PERFORMERS.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, IN THE ORDER THE CODE RAN IT. src/app/artists/page.tsx read
 * 48 performers ORDER BY name, computed their draw, and then sorted THOSE 48 in
 * JavaScript. The bound was applied before the ranking, so the control did not
 * rank the platform's strongest draw: it ranked an alphabetical prefix. A
 * performer with four thousand attributed tickets whose name begins with Z was
 * not ranked low, she was not on the page, while the hero above her said
 * "Talent with the numbers to prove it".
 *
 * WHY A UNIT TEST AT ALL, WHEN THE RANK IS NOW SQL. Two halves of this can be
 * wrong without the database being wrong, and both are cheap to hold here:
 * that the page-level read ASKS the database to rank rather than ranking after
 * the fact, and that the order the database returned survives the second read
 * that fetches the rows. `.in()` does not preserve the order of the list it was
 * handed, so "the database ranked it" and "the page renders it ranked" are two
 * different claims. The SQL itself is proven against the real project by
 * scripts/verify/lb-drawsort-drive.mjs.
 *
 * THE FIRST-CLAIM RULE IS TESTED HERE TOO, because it is the thing that keeps
 * the SQL rank and the TypeScript badge agreeing to the ticket. They render
 * together: the order comes from the query, the number printed inside each card
 * comes from fetchDrawTotalsForArtists, and a divergence shows up on the page
 * as 40, 120, 90 down the list.
 */

type Row = Record<string, unknown>

interface Request {
  table: string
  inValues: number | null
  limit: number | null
}

/**
 * A PostgREST builder with an `rpc` door, because the ranking is now a database
 * function and a fake that cannot be asked to rank cannot prove the page asks.
 *
 * `rpcRows` is returned IN THE ORDER GIVEN and the table reads deliberately
 * answer in a DIFFERENT order, so a test that passes only because both happened
 * to be sorted the same way cannot exist here.
 */
function server(
  tables: Record<string, Row[]>,
  {
    rpcRows = [] as { artist_id: string; published_tickets: number }[],
    rpcFail = '',
    fail = '',
    failTable = '',
    ceiling = 1000,
  } = {},
) {
  const requests: Request[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      return Promise.resolve(
        rpcFail ? { data: null, error: { message: rpcFail } } : { data: rpcRows, error: null },
      )
    },
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      let inCount: number | null = null
      let limit: number | null = null

      const answer = () => {
        if (fail && (!failTable || failTable === table)) {
          return { data: null, error: { message: fail } }
        }
        const width = Math.min(hi - lo + 1, ceiling)
        const slice = rows.slice(lo, lo + width)
        requests.push({ table, inValues: inCount, limit })
        return { data: slice, error: null }
      }

      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(ok, bad),
      }
      for (const method of ['select', 'is', 'not', 'neq', 'gte', 'lte', 'order', 'contains']) {
        builder[method] = () => builder
      }
      builder.eq = (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value)
        return builder
      }
      builder.in = (column: string, values: unknown[]) => {
        inCount = values.length
        const wanted = new Set(values)
        rows = rows.filter((r) => wanted.has(r[column]))
        return builder
      }
      builder.limit = (n: number) => {
        limit = n
        rows = rows.slice(0, n)
        return builder
      }
      builder.range = (a: number, b: number) => {
        lo = a
        hi = b
        return builder
      }
      return builder
    },
  }
  return { client: client as never, requests, rpcCalls }
}

const artistRow = (id: string, name: string): Row => ({
  id,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  bio: null,
  image_url: null,
  links: {},
  owner_user_id: null,
  performance_types: ['dj'],
  genres: [],
  city_slug: 'melbourne',
  available_for_booking: true,
  pay_expectation: null,
  showcase_embeds: [],
  draw_consent: true,
  mentor_open: false,
})

/*
 * The rows are stored ALPHABETICALLY and the rank is the reverse, which is the
 * shape of the real defect: the alphabetically first performers are the ones a
 * name-ordered page bound would have kept.
 */
const ARTISTS = [
  artistRow('a-aurora', 'Aurora Skies'),
  artistRow('b-marlo', 'Marlo Reyes'),
  artistRow('c-sienna', 'Sienna Vale'),
  artistRow('d-zara', 'Zara Quill'),
]
const RANK = [
  { artist_id: 'd-zara', published_tickets: 4000 },
  { artist_id: 'b-marlo', published_tickets: 120 },
  { artist_id: 'a-aurora', published_tickets: 12 },
  { artist_id: 'c-sienna', published_tickets: 0 },
]

describe('the performer directory ranks the platform rather than the alphabet', () => {
  test('the ranking is asked of the database, with the filters and the bound', async () => {
    const { client, rpcCalls } = server({ artists: ARTISTS }, { rpcRows: RANK })
    await fetchDirectoryArtistsRankedByDraw(client, {
      citySlug: 'geelong',
      performanceType: 'dj',
      availableOnly: true,
      mentorOnly: false,
      limit: 48,
    })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe(RANKED_DIRECTORY_FUNCTION)
    expect(rpcCalls[0].args).toEqual({
      p_city_slug: 'geelong',
      p_performance_type: 'dj',
      p_available_only: true,
      p_mentor_only: false,
      p_limit: 48,
    })
  })

  test('the order the database ranked is the order that comes back, not the order of the rows', async () => {
    const { client } = server({ artists: ARTISTS }, { rpcRows: RANK })
    const got = await fetchDirectoryArtistsRankedByDraw(client)
    expect(got.map((a) => a.id)).toEqual(['d-zara', 'b-marlo', 'a-aurora', 'c-sienna'])
  })

  test('the performer a name-ordered bound would have dropped is the one at the top', async () => {
    // Zara is last alphabetically and first by draw. Under the old code she was
    // on the page only if the alphabetical bound reached her.
    const { client } = server({ artists: ARTISTS }, { rpcRows: RANK })
    const got = await fetchDirectoryArtistsRankedByDraw(client)
    expect(got[0].name).toBe('Zara Quill')
  })

  test('nothing ranked means no second read at all', async () => {
    const { client, requests } = server({ artists: ARTISTS }, { rpcRows: [] })
    await expect(fetchDirectoryArtistsRankedByDraw(client)).resolves.toEqual([])
    expect(requests).toHaveLength(0)
  })

  test('a refused ranking throws rather than reporting an empty marketplace', async () => {
    const { client } = server({ artists: ARTISTS }, { rpcFail: 'statement timeout' })
    await expect(fetchDirectoryArtistsRankedByDraw(client)).rejects.toThrow(/could not be ranked/)
  })

  test('a refused row read throws rather than reporting an empty marketplace', async () => {
    const { client } = server({ artists: ARTISTS }, { rpcRows: RANK, fail: 'fetch failed' })
    await expect(fetchDirectoryArtistsRankedByDraw(client)).rejects.toThrow(/could not be read/)
  })

  test('a ranked performer whose row has gone is dropped, never rendered as a hole', async () => {
    const { client } = server({ artists: ARTISTS.filter((a) => a.id !== 'b-marlo') }, { rpcRows: RANK })
    const got = await fetchDirectoryArtistsRankedByDraw(client)
    expect(got.map((a) => a.id)).toEqual(['d-zara', 'a-aurora', 'c-sienna'])
    expect(got.every((a) => a !== undefined)).toBe(true)
  })

  test('the id list is chunked and every chunk states its own bound', async () => {
    const many = Array.from({ length: 260 }, (_, i) => artistRow(`id-${i}`, `Performer ${i}`))
    const rank = many.map((a, i) => ({
      artist_id: a.id as string,
      published_tickets: 260 - i,
    }))
    const { client, requests } = server({ artists: many }, { rpcRows: rank })
    const got = await fetchDirectoryArtistsRankedByDraw(client, { limit: 260 })
    expect(got).toHaveLength(260)
    const reads = requests.filter((r) => r.table === 'artists')
    expect(reads.length).toBeGreaterThan(1)
    for (const r of reads) {
      expect(r.inValues).toBeLessThanOrEqual(100)
      // The bound is the number of ids named, so it can never be the thing that
      // silently drops a ranked performer.
      expect(r.limit).toBe(r.inValues)
    }
  })
})

/*
 * ---------------------------------------------------------------------------
 * ONE PERFORMER PER ATTRIBUTED ORDER, AND IT IS THE FIRST CLAIM.
 *
 * share_link_events is unique on (link_id, order_id) and NOT on order_id, so
 * one order can carry a conversion on two links tagged to two performers. The
 * badge computation used to resolve that with a bare `set` on a Map keyed by
 * order id, so the winner was whichever row was processed last: an arbitrary
 * answer, and one the SQL ranking could not agree with even in principle.
 */
describe('an order claimed by two performers is counted once, for the first claim', () => {
  const links = [
    { id: 'link-early', artist_id: 'artist-early' },
    { id: 'link-late', artist_id: 'artist-late' },
  ]
  const tickets = [
    { id: 't-1', order_id: 'order-1' },
    { id: 't-2', order_id: 'order-1' },
    { id: 't-3', order_id: 'order-1' },
  ]

  test('the earliest conversion holds the order, whichever row is processed last', async () => {
    const events = [
      {
        id: 'ev-late',
        link_id: 'link-late',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:05:00.000Z',
      },
      {
        id: 'ev-early',
        link_id: 'link-early',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:00:00.000Z',
      },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early', 'artist-late'])
    expect(totals.get('artist-early')?.tickets).toBe(3)
    expect(totals.get('artist-late')?.tickets).toBe(0)
  })

  test('the order is not counted twice, so the platform total is the truth', async () => {
    const events = [
      {
        id: 'ev-a',
        link_id: 'link-early',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:00:00.000Z',
      },
      {
        id: 'ev-b',
        link_id: 'link-late',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:05:00.000Z',
      },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early', 'artist-late'])
    const sold = [...totals.values()].reduce((n, t) => n + t.tickets, 0)
    expect(sold).toBe(3)
  })

  test('orders counts what a performer holds, never a claim they lost', async () => {
    const events = [
      {
        id: 'ev-a',
        link_id: 'link-early',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:00:00.000Z',
      },
      {
        id: 'ev-b',
        link_id: 'link-late',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:05:00.000Z',
      },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early', 'artist-late'])
    // A reported sale whose tickets are zero is a number nobody can act on.
    expect(totals.get('artist-early')?.orders).toBe(1)
    expect(totals.get('artist-late')?.orders).toBe(0)
  })

  test('the id breaks a tie, so two conversions at the same instant still have one winner', async () => {
    const at = '2026-09-21T10:00:00.000Z'
    const events = [
      { id: 'ev-b', link_id: 'link-late', kind: 'conversion', order_id: 'order-1', occurred_at: at },
      { id: 'ev-a', link_id: 'link-early', kind: 'conversion', order_id: 'order-1', occurred_at: at },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early', 'artist-late'])
    expect(totals.get('artist-early')?.tickets).toBe(3)
  })

  test('a conversion with no timestamp does not beat one that has a timestamp', async () => {
    const events = [
      {
        id: 'ev-a',
        link_id: 'link-late',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: null,
      },
      {
        id: 'ev-b',
        link_id: 'link-early',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:05:00.000Z',
      },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early', 'artist-late'])
    // An absent timestamp is not evidence of being earliest.
    expect(totals.get('artist-early')?.tickets).toBe(3)
    expect(totals.get('artist-late')?.tickets).toBe(0)
  })

  test('the ordinary single-claim case is untouched', async () => {
    const events = [
      {
        id: 'ev-a',
        link_id: 'link-early',
        kind: 'conversion',
        order_id: 'order-1',
        occurred_at: '2026-09-21T10:00:00.000Z',
      },
      { id: 'ev-c', link_id: 'link-early', kind: 'click', order_id: null, occurred_at: null },
      { id: 'ev-d', link_id: 'link-early', kind: 'click', order_id: null, occurred_at: null },
    ]
    const { client } = server({ share_links: links, share_link_events: events, tickets })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-early'])
    expect(totals.get('artist-early')).toEqual({ clicks: 2, orders: 1, tickets: 3 })
  })
})

/*
 * ---------------------------------------------------------------------------
 * THE MIGRATION IS PART OF THE FIX AND IS READ AS TEXT, because the SQL is the
 * only place the disclosure decision lives and a unit test cannot execute it.
 * The BEHAVIOUR is driven against the real project; these three lines catch the
 * edit that quietly undoes the decision while every driven proof still passes
 * on a database where nobody has withheld consent.
 */
describe('the ranking query itself', () => {
  const sql = readRepoFile(
    'supabase/migrations/20260921000010_the_directory_ranks_the_platform_not_the_alphabet.sql',
  )

  test('the rank key is the PUBLISHED draw, so consent gates the position as well as the number', () => {
    expect(sql).toContain('CASE WHEN cand.draw_consent THEN COALESCE(d.tickets, 0) ELSE 0 END')
  })

  test('the bound is applied after the ranking, which is the entire defect', () => {
    const order = sql.indexOf('ORDER BY\n    CASE WHEN cand.draw_consent')
    const limit = sql.indexOf('LIMIT GREATEST(COALESCE(p_limit, 48), 0)')
    expect(order).toBeGreaterThan(-1)
    expect(limit).toBeGreaterThan(order)
  })

  test('the order is total, so the page cannot reshuffle between two renders', () => {
    expect(sql).toContain('cand.name ASC')
    expect(sql).toContain('cand.id ASC')
  })

  test('one performer per order, decided by the first claim rather than by chance', () => {
    expect(sql).toContain('SELECT DISTINCT ON (e.order_id)')
    expect(sql).toContain('ORDER BY e.order_id, e.occurred_at, e.id')
  })
})
