import { describe, it, expect } from 'vitest'
import { readArtistCatalogue } from '@/lib/seo/sitemap-catalogue'

/**
 * AN ARTIST IS ADVERTISED TO GOOGLE ONLY WHILE SOMETHING LINKS TO THEM.
 *
 * THE DEFECT, 19 September 2026. The sitemap's artist block read
 * `artists.select('slug, updated_at')` with no predicate at all, so every artist
 * row was published whether or not any page on the site reached it. The
 * reachability crawl caught it on a push of 151 commits:
 *
 *     [internal-reachability] FAIL: /artists/[slug] is classed always (a page we
 *     want ranked), /artists/aurora-skies-wrejiu answers 200, and NOTHING on the
 *     crawled site links to it.
 *
 * The only internal link to an artist profile anywhere on this platform is the
 * confirmed lineup on an event page, and every discovery surface is
 * forward-looking, so the link exists only while the event is still listed. On
 * TEST all four artists were on confirmed lineups of PUBLIC events and all four
 * of those events had ended, the most recent the day before.
 *
 * These cases pin the ways a row can fail to be a link, two of which were wrong
 * hypotheses during the investigation and were killed by measuring instead:
 *
 *   the event has ended            the row exists, the page renders nothing
 *   the lineup is not confirmed    the event page renders confirmed rows only
 *   the event is not public        no visitor can reach the page that links
 *
 * The admin client is stubbed rather than mocked through a module factory: the
 * reader takes it as its first argument precisely so this can be judged without
 * a database.
 */

type EventRow = { id: string; start_date: string; end_date: string | null; timezone: string | null }
type LineupRow = { artist_id: string; event_id: string }
type ArtistRow = { slug: string | null; updated_at: string | null }

/**
 * A stand-in for the three plain queries the reader makes, one per table.
 *
 * It records which artist ids and event ids were asked for, because the whole
 * point of the query order is that each `in()` list is bounded by the lineup
 * rather than by the catalogue, and a later refactor that inverted it would
 * still pass every assertion about the OUTPUT.
 */
function stubAdmin(fixture: {
  lineup?: LineupRow[]
  events?: EventRow[]
  artists?: ArtistRow[]
  error?: { table: 'event_artists' | 'events' | 'artists'; message: string }
}) {
  const asked = { eventIds: [] as string[], artistIds: [] as string[] }
  const from = (table: string) => {
    const fail = fixture.error?.table === table ? { message: fixture.error.message } : null
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = self
    chain.match = self
    chain.not = self
    chain.order = self
    chain.in = (_col: string, values: string[]) => {
      if (table === 'events') asked.eventIds = values
      if (table === 'artists') asked.artistIds = values
      return chain
    }
    chain.limit = () =>
      Promise.resolve({
        data: fail
          ? null
          : table === 'event_artists'
            ? (fixture.lineup ?? [])
            : table === 'events'
              // The reader filters by id itself only through `in()`; the stub
              // returns what the fixture declares as the PUBLIC rows, which is
              // what `.match(PUBLIC_EVENT_MATCH)` would have narrowed to.
              ? (fixture.events ?? [])
              : (fixture.artists ?? []),
        error: fail,
      })
    return chain
  }
  return { admin: { from } as never, asked }
}

const DAY = 86_400_000
const future = new Date(Date.now() + 30 * DAY).toISOString()
const past = new Date(Date.now() - 30 * DAY).toISOString()

const event = (id: string, endsAt: string): EventRow => ({
  id,
  start_date: endsAt,
  end_date: endsAt,
  timezone: 'Australia/Melbourne',
})

describe('readArtistCatalogue', () => {
  it('publishes_an_artist_on_the_lineup_of_an_event_that_has_not_ended', async () => {
    const { admin } = stubAdmin({
      lineup: [{ artist_id: 'a1', event_id: 'e1' }],
      events: [event('e1', future)],
      artists: [{ slug: 'sienna-vale', updated_at: '2026-09-01T00:00:00.000Z' }],
    })
    const read = await readArtistCatalogue(admin)
    expect(read.error).toBeNull()
    expect(read.rows).toEqual([{ path: '/artists/sienna-vale', lastModified: '2026-09-01T00:00:00.000Z' }])
  })

  it('does_not_publish_an_artist_whose_only_event_has_ended', async () => {
    // The exact shape of the defect: a real artist, a real confirmed lineup, a
    // real public event, and no page anywhere that still links to them.
    const { admin } = stubAdmin({
      lineup: [{ artist_id: 'a1', event_id: 'e1' }],
      events: [event('e1', past)],
      artists: [{ slug: 'aurora-skies', updated_at: null }],
    })
    const read = await readArtistCatalogue(admin)
    expect(read.error).toBeNull()
    expect(read.rows).toEqual([])
  })

  it('publishes_an_artist_who_has_one_past_night_and_one_still_to_come', async () => {
    // The past night must not remove them: the live event still links to them.
    const { admin, asked } = stubAdmin({
      lineup: [
        { artist_id: 'a1', event_id: 'gone' },
        { artist_id: 'a1', event_id: 'soon' },
      ],
      events: [event('gone', past), event('soon', future)],
      artists: [{ slug: 'the-night-owls', updated_at: null }],
    })
    const read = await readArtistCatalogue(admin)
    expect(read.rows.map(r => r.path)).toEqual(['/artists/the-night-owls'])
    // Asked for the artist exactly once, not once per lineup row.
    expect(asked.artistIds).toEqual(['a1'])
  })

  it('never_asks_for_an_event_that_is_not_on_a_confirmed_lineup', async () => {
    // The query order is the reason each `in()` list stays small. Reversing it
    // would still return the right rows and would ask the database for every
    // event on the platform.
    const { admin, asked } = stubAdmin({
      lineup: [{ artist_id: 'a1', event_id: 'e1' }],
      events: [event('e1', future)],
      artists: [{ slug: 'marlo-reyes', updated_at: null }],
    })
    await readArtistCatalogue(admin)
    expect(asked.eventIds).toEqual(['e1'])
  })

  it('publishes_nothing_when_no_lineup_is_confirmed_and_asks_no_further_question', async () => {
    const { admin, asked } = stubAdmin({ lineup: [] })
    const read = await readArtistCatalogue(admin)
    expect(read.rows).toEqual([])
    expect(read.error).toBeNull()
    expect(asked.eventIds).toEqual([])
  })

  it('skips_a_row_with_no_slug_rather_than_publishing_a_broken_url', async () => {
    const { admin } = stubAdmin({
      lineup: [{ artist_id: 'a1', event_id: 'e1' }],
      events: [event('e1', future)],
      artists: [{ slug: null, updated_at: null }],
    })
    const read = await readArtistCatalogue(admin)
    expect(read.rows).toEqual([])
  })

  it('returns_the_database_message_rather_than_swallowing_it', async () => {
    // The whole lesson of the 42703 that hid the venue block for its entire
    // life: the sitemap logs and carries on, the guard fails, and neither can
    // happen if the error never comes back.
    for (const table of ['event_artists', 'events', 'artists'] as const) {
      const { admin } = stubAdmin({
        lineup: [{ artist_id: 'a1', event_id: 'e1' }],
        events: [event('e1', future)],
        artists: [{ slug: 'sienna-vale', updated_at: null }],
        error: { table, message: `42703 on ${table}` },
      })
      const read = await readArtistCatalogue(admin)
      expect(read.error, `a failure reading ${table} must be reported`).toBe(`42703 on ${table}`)
      expect(read.rows).toEqual([])
    }
  })
})
