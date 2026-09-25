import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { captureException } from '@/lib/observability/sentry'
import { readEveryRow } from '@/lib/supabase/read-every-row'

/**
 * HONEST, LIVE PLATFORM SOCIAL PROOF. THREE NUMBERS THAT DESCRIBE ONE
 * CATALOGUE, BECAUSE THEY ARE READ FROM ONE COMPLETE PASS OVER IT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS SHAPE EXISTS TO END, measured on TEST on 21 September 2026.
 *
 * A Supabase project caps a single response at a fixed number of rows, 1,000 by
 * default: "By default, Supabase projects return a maximum of 1,000 rows ... You
 * can use range() queries to paginate through your data"
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 *
 * Measured against this project's own REST endpoint the same day, on a table
 * that is past the cap:
 *
 *     consent_events        14,433 rows in the table
 *     select with no bound  HTTP 206, error null, 1,000 rows in the body,
 *                           Content-Range: 0-999/14433
 *
 * This resolver used to ask for `{ count: 'exact' }` and then derive two of its
 * three numbers from the BODY of that same response:
 *
 *     eventsListed   from the Content-Range header   true at any catalogue size
 *     organisers     deduped from the body           capped at 1,000 events
 *     cities         deduped from the body           capped at 1,000 events
 *
 * Past a thousand published events the strip would have read, on one line,
 * "2,400 events - 1,000 organisers - 41 cities", where the first number counts
 * the catalogue and the other two describe the first thousand rows of it. The
 * exact header is what made that dangerous rather than merely wrong: it lends
 * a true total to two numbers that are a sample, so the line reads as one
 * measurement and is two. The read also carried no `.order()`, so WHICH
 * thousand rows was undefined, and the two derived numbers could move between
 * renders on an unchanged catalogue.
 *
 * CLAUDE.md Law 4 governs this surface by name: "Social proof uses real
 * platform truths only. Never fabricate numbers." A count taken from a
 * truncated sample and printed beside a true total is a fabricated number, and
 * the previous version of this file recorded the cap in its own comment and
 * deferred it ("if the catalogue outgrows that, move the dedupe into a database
 * view"), which the Definition of Done calls a defect rather than a stub.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EXACT COUNT IS GONE RATHER THAN KEPT ALONGSIDE.
 *
 * Every row is now read, so the number of rows IS the total and a second,
 * differently-sourced total could only ever be a way for the strip to disagree
 * with itself. The three numbers are derived from one array, so they describe
 * the same catalogue by construction.
 *
 * `scripts/guards/no-silent-row-ceiling.mjs` holds both halves of that: this
 * directory is in its scope, so an unbounded read here fails the build, and its
 * count clause refuses a `count:` in this path that is not `head: true`, which
 * is the exact-header-beside-a-sampled-body shape written down so it cannot
 * come back with a `.limit()` bolted on.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COSTS, STATED RATHER THAN HIDDEN. One request per thousand
 * published events, of two narrow columns, behind `revalidate = 60` on
 * /organisers, so at most once a minute per region. A database view computing
 * COUNT(DISTINCT ...) server-side is one request at any size and is the right
 * answer once the catalogue is large; it needs a migration, and it is raised in
 * C:\dev\REVIEW-QUEUE-B.md as an optimisation rather than a correctness gap.
 * This version is exact at every size today.
 *
 * `organisers` counts organisations with at least one published event (an
 * organiser you can actually browse to), not raw signups. `cities` counts the
 * distinct venue cities behind those events. The read uses the PUBLIC (anon)
 * client, so RLS decides what is counted and the numbers are the catalogue a
 * stranger can actually browse.
 *
 * On any read failure every field is null and the consuming band renders
 * nothing: a missing band is honest, an invented number is not. `readEveryRow`
 * THROWS rather than returning what it managed to collect, so a half-read
 * arrives here as a failure and hides the band, instead of arriving as a
 * smaller catalogue.
 */
export interface PlatformStats {
  eventsListed: number | null
  organisers: number | null
  cities: number | null
  source: 'live' | 'unavailable'
}

/** One row of the only two columns these three numbers need. */
export interface PlatformStatsRow {
  organisation_id: string | null
  venue_city: string | null
}

/**
 * The one query shape this resolver needs; injectable for tests.
 *
 * It is a PAGE rather than a read: `.range()` is in the signature because the
 * caller must be able to ask for a window, and `.order()` is in it because
 * paging over an undefined order can return one row twice and skip another.
 */
export interface StatsReadClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(
          column: string,
          opts: { ascending: boolean },
        ): {
          range(
            from: number,
            to: number,
          ): PromiseLike<{ data: PlatformStatsRow[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

export async function getPlatformStats(opts?: { client?: StatsReadClient }): Promise<PlatformStats> {
  try {
    const client = opts?.client ?? (createPublicClient() as unknown as StatsReadClient)

    /*
     * ORDERED ON `id` BECAUSE PAGING NEEDS A STABLE TOTAL ORDER AND `id` IS THE
     * ONLY COLUMN HERE THAT IS UNIQUE. Ordering on something non-unique lets a
     * tie straddle a page boundary, which duplicates one row and loses another,
     * and a lost row is a lost organiser or a lost city.
     */
    const rows = await readEveryRow<PlatformStatsRow>('published events for platform stats', (from, to) =>
      client
        .from('events')
        .select('organisation_id, venue_city')
        .eq('status', 'published')
        .order('id', { ascending: true })
        .range(from, to),
    )

    const organisers = new Set(rows.map(r => r.organisation_id).filter(Boolean)).size
    const cities = new Set(
      rows.map(r => (r.venue_city ?? '').trim().toLowerCase()).filter(Boolean),
    ).size

    return {
      eventsListed: rows.length,
      organisers,
      cities,
      source: 'live',
    }
  } catch (error) {
    captureException(error, { where: 'lib/stats/platform-stats:getPlatformStats' })
    // A marketing page must never 500 or show an invented number.
    return { eventsListed: null, organisers: null, cities: null, source: 'unavailable' }
  }
}
