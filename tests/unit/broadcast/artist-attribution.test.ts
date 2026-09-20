/**
 * THE ARTIST'S PORTABLE PROOF OF DRAW COUNTS EVERY ROW, OR SAYS IT COULD NOT.
 *
 * WHY THIS FILE EXISTS. `artists.test.ts` covers `generateArtistSlug` and
 * deliberately mocks the admin client to THROW, so the four READ functions in
 * `src/lib/broadcast/artists.ts` had no test of any kind. All ten of their
 * reads were unbounded with `error` discarded.
 *
 * Supabase caps a response at 1,000 rows with HTTP 200, `error` null and a
 * full-looking array (https://supabase.com/docs/reference/javascript/select,
 * fetched 2026-09-19). `share_link_events` takes one row per click, so a
 * working artist passes that in a season.
 *
 * TWO OF THE READS DO NOT MERELY SHRINK A NUMBER WHEN THEY COME BACK SHORT:
 *
 *   the `events` read in fetchArtistAttribution       a show with no meta row is
 *                                                     `continue`d, so the show
 *                                                     vanishes from the artist's
 *                                                     history entirely.
 *   the `artists` read in fetchEventArtistAttribution  a missing name falls back
 *                                                     to the words "Unknown
 *                                                     artist", rendered on the
 *                                                     organiser's lineup panel
 *                                                     beside a real performer's
 *                                                     real click count.
 *
 * These functions take `admin` as a parameter, so the stub is passed in rather
 * than mocked over the module.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchArtistAttribution,
  fetchEventArtistAttribution,
  fetchArtistUpcomingShows,
  fetchEventLineup,
} from '@/lib/broadcast/artists'

const data: Record<string, Record<string, unknown>[]> = {
  share_links: [],
  share_link_events: [],
  tickets: [],
  events: [],
  artists: [],
  event_artists: [],
}

/** Supabase's real per-RESPONSE cap. A paged reader walks past it. */
const perResponseCeiling: Record<string, number | undefined> = {}
/** A read that FAILS, so "error discarded" can be tested. */
const failOn: Record<string, string | undefined> = {}

function stubAdmin() {
  return {
    from(table: string) {
      const preds: ((r: Record<string, unknown>) => boolean)[] = []
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (col: string, val: unknown) => {
        preds.push(r => !(col in r) || r[col] === val)
        return builder
      }
      builder.in = (col: string, vals: unknown[]) => {
        preds.push(r => !(col in r) || vals.includes(r[col]))
        return builder
      }
      builder.not = () => builder
      builder.order = () => builder
      builder.limit = () => builder
      builder.range = (from: number, to: number) => {
        lo = from
        hi = to
        return builder
      }
      builder.maybeSingle = () =>
        Promise.resolve({ data: (data[table] ?? [])[0] ?? null, error: null })
      builder.then = (resolve: (v: Record<string, unknown>) => unknown) => {
        const failure = failOn[table]
        if (failure) {
          return Promise.resolve({ data: null, error: { message: failure } }).then(resolve)
        }
        const all = (data[table] ?? []).filter(r => preds.every(p => p(r)))
        const window = all.slice(lo, hi + 1)
        const cap = perResponseCeiling[table]
        return Promise.resolve({
          data: typeof cap === 'number' ? window.slice(0, cap) : window,
          error: null,
        }).then(resolve)
      }
      return builder
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => stubAdmin() as any

beforeEach(() => {
  for (const k of Object.keys(data)) data[k] = []
  for (const k of Object.keys(perResponseCeiling)) delete perResponseCeiling[k]
  for (const k of Object.keys(failOn)) delete failOn[k]
})

describe('fetchArtistAttribution: the number an artist shows the next promoter', () => {
  beforeEach(() => {
    data.share_links = [
      { id: 'l1', event_id: 'e1', artist_id: 'a1' },
      { id: 'l2', event_id: 'e2', artist_id: 'a1' },
    ]
    data.events = [
      { id: 'e1', title: 'Night One', slug: 'night-one', start_date: '2026-10-01T00:00:00Z' },
      { id: 'e2', title: 'Night Two', slug: 'night-two', start_date: '2026-11-01T00:00:00Z' },
    ]
  })

  it('counts clicks, conversions and tickets per show', async () => {
    data.share_link_events = [
      { link_id: 'l1', kind: 'click', order_id: null },
      { link_id: 'l1', kind: 'conversion', order_id: 'o1' },
      { link_id: 'l2', kind: 'click', order_id: null },
    ]
    data.tickets = [{ order_id: 'o1' }, { order_id: 'o1' }]

    const r = await fetchArtistAttribution(admin(), 'a1')

    expect(r.totals).toEqual({ clicks: 2, conversions: 1, tickets: 2 })
    expect(r.shows).toHaveLength(2)
  })

  it('pages past the response cap rather than reporting the first page', async () => {
    data.share_link_events = Array.from({ length: 11 }, () => ({
      link_id: 'l1',
      kind: 'click',
      order_id: null,
    }))
    perResponseCeiling.share_link_events = 3

    const r = await fetchArtistAttribution(admin(), 'a1')

    expect(r.totals.clicks, 'eleven clicks, read three at a time').toBe(11)
  })

  it('KEEPS EVERY SHOW when the event meta comes back a page at a time', async () => {
    /*
     * The `if (!meta) continue` branch. A show whose meta row did not arrive is
     * dropped outright, so this read losing rows deletes history rather than
     * shrinking a count.
     */
    data.share_link_events = [
      { link_id: 'l1', kind: 'click', order_id: null },
      { link_id: 'l2', kind: 'click', order_id: null },
    ]
    perResponseCeiling.events = 1

    const r = await fetchArtistAttribution(admin(), 'a1')

    expect(r.shows.map(s => s.eventSlug).sort()).toEqual(['night-one', 'night-two'])
  })

  it('throws when the links cannot be read, rather than reporting no draw at all', async () => {
    failOn.share_links = 'connection terminated'
    await expect(fetchArtistAttribution(admin(), 'a1')).rejects.toThrow(/tracked links/i)
  })

  it('throws when the event meta cannot be read', async () => {
    data.share_link_events = [{ link_id: 'l1', kind: 'click', order_id: null }]
    failOn.events = 'connection terminated'
    await expect(fetchArtistAttribution(admin(), 'a1')).rejects.toThrow(/shows those links belong to/i)
  })
})

describe('fetchEventArtistAttribution: the organiser side of the lineup', () => {
  beforeEach(() => {
    data.share_links = [{ id: 'l1', event_id: 'e1', artist_id: 'a1' }]
    data.artists = [{ id: 'a1', name: 'Sienna' }]
  })

  it('names the artist and counts their clicks', async () => {
    data.share_link_events = [
      { link_id: 'l1', kind: 'click', order_id: null },
      { link_id: 'l1', kind: 'conversion', order_id: 'o1' },
    ]
    data.tickets = [{ order_id: 'o1' }]

    const rows = await fetchEventArtistAttribution(admin(), 'e1')

    expect(rows).toEqual([
      { artistId: 'a1', artistName: 'Sienna', clicks: 1, conversions: 1, tickets: 1 },
    ])
  })

  it('NEVER RENDERS "Unknown artist" for an artist who exists', async () => {
    /*
     * The fallback below this read is `?? 'Unknown artist'`, so a short read
     * does not hide a row, it mislabels a real performer on the organiser's own
     * screen. Paging is what stops that.
     */
    data.share_links = [
      { id: 'l1', event_id: 'e1', artist_id: 'a1' },
      { id: 'l2', event_id: 'e1', artist_id: 'a2' },
      { id: 'l3', event_id: 'e1', artist_id: 'a3' },
    ]
    data.artists = [
      { id: 'a1', name: 'Sienna' },
      { id: 'a2', name: 'Kofi' },
      { id: 'a3', name: 'Mara' },
    ]
    data.share_link_events = [
      { link_id: 'l1', kind: 'click', order_id: null },
      { link_id: 'l2', kind: 'click', order_id: null },
      { link_id: 'l3', kind: 'click', order_id: null },
    ]
    perResponseCeiling.artists = 1

    const rows = await fetchEventArtistAttribution(admin(), 'e1')

    expect(rows.map(r => r.artistName).sort()).toEqual(['Kofi', 'Mara', 'Sienna'])
  })

  it('throws when the artist names cannot be read at all', async () => {
    data.share_link_events = [{ link_id: 'l1', kind: 'click', order_id: null }]
    failOn.artists = 'connection terminated'
    await expect(fetchEventArtistAttribution(admin(), 'e1')).rejects.toThrow(/names of those artists/i)
  })
})

describe('fetchArtistUpcomingShows: the bound is on the question, not the answer', () => {
  it('finds a future show that sits past the response cap', async () => {
    /*
     * The filter runs AFTER the read, so an unpaged read could hand back a
     * thousand rows of which none is the next show. Nine past shows and one
     * future one, served three at a time, is that shape in miniature.
     */
    const past = Array.from({ length: 9 }, (_, i) => ({
      id: `ea${i}`,
      artist_id: 'a1',
      status: 'confirmed',
      event: {
        id: `old${i}`,
        slug: `old-${i}`,
        title: `Old ${i}`,
        start_date: '2020-01-01T00:00:00Z',
        timezone: null,
        venue_name: 'The Hall',
        venue_city: 'Geelong',
        status: 'published',
        visibility: 'public',
      },
    }))
    data.event_artists = [
      ...past,
      {
        id: 'ea-next',
        artist_id: 'a1',
        status: 'confirmed',
        event: {
          id: 'next',
          slug: 'the-next-one',
          title: 'The Next One',
          start_date: '2099-01-01T00:00:00Z',
          timezone: null,
          venue_name: 'The Hall',
          venue_city: 'Geelong',
          status: 'published',
          visibility: 'public',
        },
      },
    ]
    perResponseCeiling.event_artists = 3

    const shows = await fetchArtistUpcomingShows(admin(), 'a1')

    expect(shows.map(s => s.slug)).toEqual(['the-next-one'])
    expect(shows[0].venueLabel).toBe('The Hall, Geelong')
  })

  it('throws rather than telling an artist they have no shows booked', async () => {
    failOn.event_artists = 'connection terminated'
    await expect(fetchArtistUpcomingShows(admin(), 'a1')).rejects.toThrow(/confirmed on/i)
  })
})

describe('fetchEventLineup: paged on the key, ordered on billing afterwards', () => {
  it('returns every act in billing order even when the read is paged', async () => {
    /*
     * `billing_order` is not unique, so paging ON it is undefined. The read is
     * ordered by the primary key and the billing order is applied in memory,
     * and this asserts the ORDER survives that, not merely the rows.
     */
    data.event_artists = [
      { id: 'ea3', event_id: 'e1', status: 'confirmed', invite_token: null, billing_order: 3, artist: { id: 'a3', slug: 'c', name: 'Third', links: {} } },
      { id: 'ea1', event_id: 'e1', status: 'confirmed', invite_token: null, billing_order: 1, artist: { id: 'a1', slug: 'a', name: 'First', links: {} } },
      { id: 'ea2', event_id: 'e1', status: 'invited', invite_token: 't', billing_order: 2, artist: { id: 'a2', slug: 'b', name: 'Second', links: {} } },
    ]
    perResponseCeiling.event_artists = 1

    const lineup = await fetchEventLineup(admin(), 'e1')

    expect(lineup.map(l => l.artist.name)).toEqual(['First', 'Second', 'Third'])
  })

  it('throws when the lineup cannot be read', async () => {
    failOn.event_artists = 'connection terminated'
    await expect(fetchEventLineup(admin(), 'e1')).rejects.toThrow(/lineup for this event/i)
  })
})
