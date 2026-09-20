import { describe, expect, test } from 'vitest'
import { readRepoFile } from '../../helpers/read-repo-file'
import { stripComments } from '../../../scripts/guards/lib/source.mjs'
import {
  fetchArtistCredits,
  fetchDirectoryArtists,
  fetchDrawTotalsForArtists,
  fetchShowcaseArtistBySlug,
  fetchShowcaseArtistForOwner,
} from '@/lib/marketplace/showcase'

/**
 * A PERFORMER'S PROOF OF DRAW IS THE NUMBER THEY SHOW THE NEXT PROMOTER, SO
 * UNDER-REPORTING IT IS THE EXPENSIVE DIRECTION, AND THE DIRECTORY THAT RANKS
 * THEM BY IT MAY NOT BE RANKING A TRUNCATION.
 *
 * ---------------------------------------------------------------------------
 * THE SAME FUNCTION WAS FIXED ONCE ALREADY AND ITS TWIN WAS NOT. On 19
 * September `fetchArtistAttribution` in src/lib/broadcast/artists.ts was routed
 * through the pager for exactly this reason, in its own words: "share_link_events
 * takes one row per click, so a working artist passes the 1,000-row ceiling and
 * their proof quietly shrinks". `fetchDrawTotalsForArtists` is that function for
 * the DIRECTORY rather than for one performer, it was written the same way, and
 * it was left behind. It reaches the ceiling sooner, not later, because it reads
 * the links of every performer on the page at once.
 *
 * AND THE DIRECTORY SORTS ON IT. src/app/artists/page.tsx orders by
 * `draw?.tickets ?? 0` when the reader asks for sort=draw. A truncated count
 * does not merely under-report a performer, it RE-ORDERS the page: the
 * performer who sells most can be ranked below one who sells less, on a surface
 * whose own heading is "Talent with the numbers to prove it" and whose subtitle
 * promises "the exact tickets their sharing sold".
 *
 * THE SEVEN DISCARDED READS. Every read in the module bound `data` and dropped
 * `error`, so a blink was indistinguishable from an empty answer:
 *
 *   the public directory   renders "No performers match those filters yet" to a
 *                          promoter, with a 200, when the platform is full
 *   the public profile     the whole showcase (the embeds, the genres, the
 *                          booking availability, the draw) silently is not there
 *   the owner's own read   the editor disappears off the performer's dashboard,
 *                          which is the only control they have over their own
 *                          public profile
 *   the credits            a performer's past shows read as a performer who has
 *                          never played
 *
 * EVERY READ IS TESTED AGAINST A FAKE SERVER rather than a fake reader, because
 * both failures are properties of the server: it can refuse, and it can answer
 * 200 with rows left out and nothing in the response saying so.
 */

type Row = Record<string, unknown>

interface Request {
  table: string
  lo: number
  hi: number
  inValues: number | null
}

/**
 * A PostgREST builder over several tables, with a CEILING, exactly as the real
 * server behaves: at most `ceiling` rows per response, HTTP 200, `error` null,
 * and nothing in the response saying rows were left out.
 *
 * `eq` and `in` really filter, so a test that asks for one artist's rows gets
 * one artist's rows and the chunking assertions are about real requests.
 */
function server(
  tables: Record<string, Row[]>,
  { ceiling = 1000, fail = '', failTable = '', failCode = '' } = {},
) {
  const requests: Request[] = []
  const client = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      let single = false
      let inCount: number | null = null

      const answer = () => {
        if (fail && (!failTable || failTable === table)) {
          return { data: null, error: { message: fail, ...(failCode ? { code: failCode } : {}) } }
        }
        if (single) return { data: rows[0] ?? null, error: null }
        const width = Math.min(hi - lo + 1, ceiling)
        const slice = rows.slice(lo, lo + width)
        requests.push({ table, lo, hi, inValues: inCount })
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
        rows = rows.slice(0, n)
        return builder
      }
      builder.range = (a: number, b: number) => {
        lo = a
        hi = b
        return builder
      }
      builder.maybeSingle = () => {
        single = true
        return builder
      }
      return builder
    },
  }
  return { client: client as never, requests }
}

const artistRow = (over: Row = {}): Row => ({
  id: 'artist-1',
  slug: 'lane-b-performer',
  name: 'Lane B Performer',
  bio: null,
  image_url: null,
  links: {},
  owner_user_id: 'user-1',
  performance_types: ['dj'],
  genres: [],
  city_slug: 'melbourne',
  available_for_booking: true,
  pay_expectation: null,
  showcase_embeds: [],
  draw_consent: true,
  mentor_open: false,
  ...over,
})

describe('the public performer directory, which a promoter judges the platform by', () => {
  test('a refused read throws rather than drawing a marketplace with no performers on it', async () => {
    const { client } = server({ artists: [] }, { fail: 'connection reset by peer' })
    await expect(fetchDirectoryArtists(client)).rejects.toThrow(/could not be read/)
  })

  test('genuinely no matches is still an empty list', async () => {
    const { client } = server({ artists: [] })
    await expect(fetchDirectoryArtists(client)).resolves.toEqual([])
  })

  test('the browse bound is still a bound and was not turned into a whole-table read', async () => {
    const many = Array.from({ length: 200 }, (_, i) => artistRow({ id: `a-${i}`, slug: `s-${i}` }))
    const { client, requests } = server({ artists: many })
    const got = await fetchDirectoryArtists(client)
    expect(got).toHaveLength(48)
    expect(requests.filter((r) => r.table === 'artists')).toHaveLength(1)
  })
})

describe('the showcase behind the public profile and behind the performer own editor', () => {
  test('a refused read throws rather than stripping the showcase off a public profile', async () => {
    const { client } = server({ artists: [] }, { fail: 'statement timeout' })
    await expect(fetchShowcaseArtistBySlug(client, 'lane-b-performer')).rejects.toThrow()
  })

  test('a performer who has not set one up is null, which is the truth', async () => {
    const { client } = server({ artists: [] })
    await expect(fetchShowcaseArtistBySlug(client, 'lane-b-performer')).resolves.toBeNull()
  })

  test('the database saying no row is null and never a throw', async () => {
    const { client } = server({ artists: [] }, { fail: 'no rows returned', failCode: 'PGRST116' })
    await expect(fetchShowcaseArtistBySlug(client, 'lane-b-performer')).resolves.toBeNull()
  })

  test('a malformed slug is still refused before it reaches the database', async () => {
    const { client, requests } = server({ artists: [artistRow()] })
    await expect(fetchShowcaseArtistBySlug(client, 'not a slug/../etc')).resolves.toBeNull()
    expect(requests).toHaveLength(0)
  })

  test('the owner own read throws rather than taking the editor off their dashboard', async () => {
    const { client } = server({ artists: [] }, { fail: 'pool exhausted' })
    await expect(fetchShowcaseArtistForOwner(client, 'user-1')).rejects.toThrow()
  })
})

const LINKS = Array.from({ length: 3 }, (_, i) => ({ id: `link-${i}`, artist_id: 'artist-1' }))
const EVENTS = [
  ...Array.from({ length: 1800 }, (_, i) => ({
    id: `ev-${i}`,
    link_id: 'link-0',
    kind: 'click',
    order_id: null,
  })),
  ...Array.from({ length: 1200 }, (_, i) => ({
    id: `cv-${i}`,
    link_id: 'link-1',
    kind: 'conversion',
    order_id: `order-${i}`,
  })),
]
const TICKETS = Array.from({ length: 2400 }, (_, i) => ({
  id: `t-${i}`,
  order_id: `order-${i % 1200}`,
}))

describe('the draw totals that rank the directory', () => {
  test('every click and every conversion is counted through a ceiling that hides the rest', async () => {
    const { client, requests } = server(
      { share_links: LINKS, share_link_events: EVENTS, tickets: TICKETS },
      { ceiling: 1000 },
    )
    const totals = await fetchDrawTotalsForArtists(client, ['artist-1'])
    const mine = totals.get('artist-1')
    expect(mine?.clicks).toBe(1800)
    expect(mine?.orders).toBe(1200)
    // The ceiling was real: no single response was allowed to carry more.
    const widest = Math.max(
      ...requests.filter((r) => r.table === 'share_link_events').map((r) => r.hi - r.lo + 1),
    )
    expect(widest).toBeLessThanOrEqual(1000)
  })

  test('the tickets those orders carry are counted through the ceiling too', async () => {
    const { client } = server(
      { share_links: LINKS, share_link_events: EVENTS, tickets: TICKETS },
      { ceiling: 1000 },
    )
    const totals = await fetchDrawTotalsForArtists(client, ['artist-1'])
    expect(totals.get('artist-1')?.tickets).toBe(2400)
  })

  test.each([
    ['share_links'],
    ['share_link_events'],
    ['tickets'],
  ])('a refused read on %s throws rather than reporting a draw of zero', async (table) => {
    const { client } = server(
      { share_links: LINKS, share_link_events: EVENTS, tickets: TICKETS },
      { fail: 'fetch failed', failTable: table },
    )
    await expect(fetchDrawTotalsForArtists(client, ['artist-1'])).rejects.toThrow()
  })

  test('the in-filter lists are chunked, so a full directory is never one giant request', async () => {
    const ids = Array.from({ length: 480 }, (_, i) => `artist-${i}`)
    const links = ids.map((id, i) => ({ id: `link-${i}`, artist_id: id }))
    const { client, requests } = server({ share_links: links, share_link_events: [], tickets: [] })
    await fetchDrawTotalsForArtists(client, ids)
    const linkRequests = requests.filter((r) => r.table === 'share_links')
    expect(linkRequests.length).toBeGreaterThan(1)
    for (const r of linkRequests) expect(r.inValues).toBeLessThanOrEqual(100)
  })

  test('a performer with genuinely no tracked links simply has no entry', async () => {
    const { client } = server({ share_links: [], share_link_events: [], tickets: [] })
    const totals = await fetchDrawTotalsForArtists(client, ['artist-1'])
    expect(totals.size).toBe(0)
  })

  test('no artists asked for means no request at all', async () => {
    const { client, requests } = server({ share_links: LINKS })
    await expect(fetchDrawTotalsForArtists(client, [])).resolves.toEqual(new Map())
    expect(requests).toHaveLength(0)
  })
})

/** 2,500 past shows, oldest first, so the twelve NEWEST sit beyond the ceiling. */
const CREDITS = Array.from({ length: 2500 }, (_, i) => ({
  id: `ea-${String(i).padStart(4, '0')}`,
  artist_id: 'artist-1',
  status: 'confirmed',
  event: {
    id: `e-${i}`,
    slug: `show-${i}`,
    title: `Show ${i}`,
    start_date: new Date(Date.UTC(2020, 0, 1) + i * 3_600_000).toISOString(),
    timezone: 'Australia/Melbourne',
    venue_name: 'The Venue',
    venue_city: 'Melbourne',
    status: 'published',
    visibility: 'public',
  },
}))

describe('the credits on a public performer profile', () => {
  test('the twelve most recent are chosen from EVERY row, not from the first thousand', async () => {
    const { client } = server({ event_artists: CREDITS }, { ceiling: 1000 })
    const credits = await fetchArtistCredits(client, 'artist-1')
    expect(credits).toHaveLength(12)
    // Newest first, and the newest is show 2499, which lives past the ceiling.
    expect(credits[0].slug).toBe('show-2499')
    expect(credits[11].slug).toBe('show-2488')
  })

  test('a refused read throws rather than drawing a performer who has never played', async () => {
    const { client } = server({ event_artists: [] }, { fail: 'connection reset' })
    await expect(fetchArtistCredits(client, 'artist-1')).rejects.toThrow()
  })

  test('an unlisted show never reaches a public profile, which is the child-safety allow-list', async () => {
    const unlisted = {
      ...CREDITS[0],
      id: 'ea-unlisted',
      event: { ...CREDITS[0].event, slug: 'unlisted-show', visibility: 'unlisted' },
    }
    const { client } = server({ event_artists: [unlisted] })
    await expect(fetchArtistCredits(client, 'artist-1')).resolves.toEqual([])
  })
})

describe('the module itself, so the eighth occurrence has nowhere to happen', () => {
  test('no read in showcase.ts binds data while dropping its error', () => {
    const source = stripComments(readRepoFile('src/lib/marketplace/showcase.ts'))
    /*
     * BINDING `error` IS THE POINT, so the match has to exclude the destructure
     * that binds it. The first version of this test did not, flagged the one
     * CORRECT `const { data, error } = await` in the directory read, and would
     * have been "fixed" by deleting the binding it exists to require. Written
     * down because a text assertion that fails on the fix is worse than no
     * assertion at all.
     */
    const destructures = source.match(/const\s*\{\s*data[^}]*\}\s*=\s*await/g) ?? []
    const discarded = destructures.filter((d) => !/\berror\b/.test(d))
    expect(discarded).toEqual([])
    expect(destructures.length).toBeGreaterThan(0)
  })

  test('every read in showcase.ts reaches one of the two doors', () => {
    const source = stripComments(readRepoFile('src/lib/marketplace/showcase.ts'))
    const selects = (source.match(/\.from\(/g) ?? []).length
    const doored =
      (source.match(/readEveryRow[(<]/g) ?? []).length +
      (source.match(/readOrThrow\(/g) ?? []).length
    expect(selects).toBeGreaterThan(0)
    expect(doored).toBeGreaterThanOrEqual(selects - 1)
  })
})
