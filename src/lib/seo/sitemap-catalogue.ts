import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { isStillListed } from '@/lib/events/listing-window'
import { venueSlugify } from '@/lib/venues/resolver'
import { isOrganiserProfileIndexable } from '@/lib/seo/indexing-policy'

/**
 * THE THREE FAMILIES OF SITEMAP URL THAT COME FROM ROWS, READ IN ONE PLACE
 * (close-out SEO2, 14 September 2026).
 *
 * WHY THIS FILE EXISTS. `src/app/sitemap.ts` publishes about 600 URLs and three
 * of its families are not derivable from source at all: an event page exists
 * because an `events` row exists, an organiser profile because an
 * `organisations` row exists, a venue profile because some published event names
 * that venue. Every other family in that file is a list a guard can read.
 *
 * Those three are also where every sitemap defect this repository has recorded
 * actually happened, and each one was SILENT:
 *
 *   - the venue block queried `venues.slug`, a column that has never existed.
 *     Postgres answered 42703, a bare `catch {}` threw it away, and the block
 *     published nothing at all for its whole life while looking exactly like a
 *     platform with no venues (fixed 25 August 2026).
 *   - the organiser block had no `status` predicate, so eight 'pending'
 *     organisations were advertised to Google and answered 404 (fixed the same
 *     day).
 *   - 545 of 550 URLs were templated pages holding nothing, and Search Console
 *     reported them back as duplicates of one another (close-out C19.3).
 *
 * None of those is visible to lint, typecheck, the build or a unit test. They
 * are visible only by asking the database what it holds and asking the sitemap
 * what it published, and comparing the two. `sitemap.ts` cannot be executed
 * outside Next (it reaches `next/cache` through the discovery counts), so a
 * build-time guard cannot call it. This module can be executed anywhere, so the
 * guard calls THIS, and `sitemap.ts` calls it too, and the thing the guard
 * judges is therefore the thing that ships.
 *
 * AN ERROR IS RETURNED, NEVER SWALLOWED. Each reader hands back `{ rows, error }`.
 * The sitemap logs the error and publishes what it has, because a sitemap must
 * never 500. The guard FAILS on it, because a build whose sitemap query is
 * broken is a build that will advertise an empty catalogue to Google. That split
 * is the whole lesson of the 42703: the same fact needs opposite responses in a
 * request and in a build.
 */

/** One row-derived sitemap URL: the path, and the modification date if we hold one. */
export type CatalogueRow = {
  /** Site-relative path, always beginning with a slash. */
  path: string
  /** ISO timestamp from the database, or null when we do not hold one. */
  lastModified: string | null
}

export type CatalogueRead = {
  rows: CatalogueRow[]
  /** The database's own message, verbatim, or null. */
  error: string | null
}

/**
 * The row cap every reader shares.
 *
 * It is a real limit and it is stated rather than hidden: past this many rows
 * the sitemap would silently truncate, and the guard's completeness check is
 * what would notice. Both sides read the same constant so they truncate
 * identically and a difference the guard reports is a real difference rather
 * than two caps disagreeing.
 */
export const CATALOGUE_ROW_CAP = 5000

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Every publicly visible event with a slug, as `/events/{slug}`.
 *
 * The predicate is `PUBLIC_EVENT_MATCH` and nothing else, deliberately: the
 * event page itself resolves a published, public event whatever its dates, so
 * applying the listing window here would drop a past event's URL from the
 * sitemap while the page still answered 200.
 */
export async function readEventCatalogue(admin: AdminClient = createAdminClient()): Promise<CatalogueRead> {
  try {
    const { data, error } = await admin
      .from('events')
      .select('slug, updated_at')
      .match(PUBLIC_EVENT_MATCH)
      .not('slug', 'is', null)
      // DETERMINISTIC ORDER. Without an explicit ORDER BY, PostgREST returns
      // rows in Postgres physical order, which changes as rows are updated.
      // scripts/ci/resolve-gate-urls.mjs picks event pages out of this sitemap,
      // so an unordered query made the Lighthouse gate audit a different page on
      // different runs of the same branch and blocked two merges on 2026-08-23.
      .order('slug', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (error) return { rows: [], error: error.message }
    const rows: CatalogueRow[] = []
    for (const row of data ?? []) {
      const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
      if (!slug) continue
      rows.push({
        path: `/events/${slug}`,
        lastModified: typeof row.updated_at === 'string' ? row.updated_at : null,
      })
    }
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Every organiser profile that is BOTH resolvable and a page, as
 * `/organisers/{slug}`.
 *
 * Two predicates, and they answer different questions:
 *
 *   status = 'active'   the page resolves at all. `/organisers/[slug]` calls
 *                       notFound() for anything else, so a sitemap without this
 *                       advertises a 404.
 *   indexable           the page is worth indexing: events at the owner's live
 *                       threshold, or a written biography (close-out SEO3 step
 *                       7). A profile the page has sent to noindex while the
 *                       sitemap still advertises it is the exact contradiction
 *                       Search Console reports back as an exclusion.
 *
 * The event count is passed IN rather than read here, because the sitemap holds
 * one cached read of every public event dimension and counts about 490 URLs off
 * it, and a second read inside this function could answer differently halfway
 * through one request.
 */
export async function readOrganiserCatalogue(options: {
  /** Published, publicly visible events for an organisation id. */
  eventCountFor: (organisationId: string) => number
  /** The live indexing threshold. */
  threshold: number
  admin?: AdminClient
}): Promise<CatalogueRead> {
  const admin = options.admin ?? createAdminClient()
  try {
    const { data, error } = await admin
      .from('organisations')
      // `id` and `description` are read for the substance rule: the page decides
      // its own robots directive from the event count and the biography.
      .select('id, slug, description, updated_at')
      .not('slug', 'is', null)
      .eq('status', 'active')
      .order('slug', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (error) return { rows: [], error: error.message }
    const rows: CatalogueRow[] = []
    for (const row of data ?? []) {
      const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
      if (!slug) continue
      const hasBiography = typeof row.description === 'string' && row.description.trim().length > 0
      if (!isOrganiserProfileIndexable(options.eventCountFor(String(row.id)), hasBiography, options.threshold)) {
        continue
      }
      rows.push({
        path: `/organisers/${slug}`,
        lastModified: typeof row.updated_at === 'string' ? row.updated_at : null,
      })
    }
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Every venue profile that resolves, as `/venues/{handle}`.
 *
 * DERIVED FROM EVENTS, NOT FROM `venues`, and the reason is that the ROUTE is.
 * `/venues/[handle]` resolves through `resolveVenueProfile`, whose handle is
 * `venueSlugify(venue.name)`, and whose venue-table lookup reads only the first
 * 50 active rows and matches in JavaScript: a 51st venue row would be published
 * here and 404 on the page. The events path has no such cap, so deriving from it
 * cannot drift from the resolver. A venue with no public events is also an empty
 * page, and the market-ready bar is explicit that a route resolving 200 to a
 * designed empty state is still not something to advertise.
 */
export async function readVenueCatalogue(admin: AdminClient = createAdminClient()): Promise<CatalogueRead> {
  try {
    const { data, error } = await admin
      .from('events')
      .select('venue_name, updated_at')
      .match(PUBLIC_EVENT_MATCH)
      .not('venue_name', 'is', null)
      .order('venue_name', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (error) return { rows: [], error: error.message }
    /** handle -> most recent updated_at among the events at that venue. */
    const handles = new Map<string, string | null>()
    for (const row of data ?? []) {
      const name = typeof row.venue_name === 'string' ? row.venue_name.trim() : ''
      if (!name) continue
      const handle = venueSlugify(name)
      if (!handle) continue
      const seen = handles.get(handle) ?? null
      const next = typeof row.updated_at === 'string' ? row.updated_at : null
      if (!handles.has(handle) || (next && (!seen || next > seen))) {
        handles.set(handle, next)
      }
    }
    const rows: CatalogueRow[] = []
    for (const handle of [...handles.keys()].sort()) {
      rows.push({ path: `/venues/${handle}`, lastModified: handles.get(handle) ?? null })
    }
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Every artist profile the site currently LINKS TO, as `/artists/{slug}`.
 *
 * THE DEFECT, 19 September 2026, and it refused a push of 151 commits:
 *
 *     [internal-reachability] FAIL: /artists/[slug] is classed always (a page we
 *     want ranked), /artists/aurora-skies-wrejiu answers 200, and NOTHING on the
 *     crawled site links to it.
 *
 * THE BLOCK THIS REPLACES read `artists.select('slug, updated_at')` with no
 * predicate at all: every artist row was advertised to Google whether or not any
 * page reached it. The ONLY internal link to an artist profile anywhere on this
 * platform is the confirmed lineup on an event page
 * (`src/app/events/[slug]/page.tsx`), and every discovery surface is
 * forward-looking by design, so an artist whose nights are all over is reachable
 * from nothing.
 *
 * TWO WRONG EXPLANATIONS WERE KILLED BY MEASUREMENT FIRST, and both are recorded
 * because each would have produced a different and wrong fix:
 *
 *   NOT "the artists have no events". All four artist rows on TEST are on a
 *     CONFIRMED lineup of a published, public event.
 *   NOT "RLS hides the lineup from an anonymous reader". The anonymous client
 *     reads those same rows (2, 2, 1, 2), so the event pages render the links.
 *
 * What is actually true is that all four of those events have ENDED: 8 July,
 * 14 August, 21 August, and 18 September, which was the day before this was
 * written. Seventy-seven LIVE events are linked and crawled, and not one of them
 * has a lineup. So the check was correct, nothing in the tree had changed, and
 * the platform had simply gone on telling Google about four pages a visitor
 * could no longer reach.
 *
 * THE WINDOW IS WHY THIS DIFFERS FROM THE EVENT AND VENUE READERS ABOVE, which
 * deliberately keep publishing a past event. An event page is content about a
 * real night and its long tail is worth accumulating; a venue page lists that
 * history. An artist page is reachable ONLY through a live lineup, and the
 * founder's standing ruling on the artist layer is that it "is not marketed
 * until there are events worth attaching artists to"
 * (src/lib/flags/broadcast.ts, 2026-08-15). Advertising an artist nothing links
 * to is marketing it.
 *
 * THE WINDOW IS THE PLATFORM'S OWN, NOT A SECOND COPY OF IT. The rows are
 * filtered with `isStillListed`, the same function every discovery surface uses,
 * applied in JavaScript rather than rebuilt as a PostgREST predicate. A second
 * dialect of the listing rule is a new way for the sitemap and the pages to
 * disagree, which is the whole failure this module exists to prevent.
 */
export async function readArtistCatalogue(admin: AdminClient = createAdminClient()): Promise<CatalogueRead> {
  try {
    /*
     * THREE PLAIN QUERIES, NO EMBEDS, AND THE SHAPE IS NOT A STYLE CHOICE.
     *
     * The first version asked one question with `artists!inner(...)` and
     * `events!inner(...)`, which reads well and was refused by a registered
     * guard: `sitemap-resolves` attributes every column in a select to the
     * table being queried, so it reported `event_artists.timezone` and five
     * more "which does not exist in src/types/database.ts". The guard was not
     * wrong to refuse. It exists because a column that does not exist makes
     * Postgres answer 42703 and a catch turn that into an empty sitemap
     * section, which is exactly how the venue block published nothing for its
     * whole life, and a guard that cannot read the query cannot protect it.
     *
     * The order is also deliberate. Confirmed lineup rows are the SMALLEST set
     * on this path, so asking them first bounds both `in()` lists by the number
     * of lineup rows rather than by the number of events on the platform.
     */
    const lineup = await admin
      .from('event_artists')
      .select('artist_id, event_id')
      .eq('status', 'confirmed')
      // DETERMINISTIC ORDER, for the reason readEventCatalogue gives above:
      // without an explicit ORDER BY, PostgREST returns rows in Postgres
      // physical order, which changes as rows are updated. That decides WHICH
      // rows the cap below truncates, so an unordered paged read publishes a
      // different set of artists on different runs of the same tree.
      .order('event_id', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (lineup.error) return { rows: [], error: lineup.error.message }
    const lineupRows = (lineup.data ?? []) as { artist_id: string; event_id: string }[]
    if (lineupRows.length === 0) return { rows: [], error: null }

    const events = await admin
      .from('events')
      .select('id, start_date, end_date, timezone')
      .in('id', [...new Set(lineupRows.map(r => r.event_id))])
      .match(PUBLIC_EVENT_MATCH)
      .order('id', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (events.error) return { rows: [], error: events.error.message }

    // THE WINDOW IS THE PLATFORM'S OWN, applied with `isStillListed`, the same
    // function every discovery surface uses. A second dialect of the listing
    // rule written as a PostgREST predicate is a new way for the sitemap and
    // the pages to disagree, which is the failure this module exists to prevent.
    const now = new Date()
    const liveEventIds = new Set(
      ((events.data ?? []) as { id: string; start_date: string; end_date: string | null; timezone: string | null }[])
        .filter(e => typeof e.start_date === 'string' && isStillListed(e, now))
        .map(e => e.id),
    )
    if (liveEventIds.size === 0) return { rows: [], error: null }

    const artistIds = [...new Set(lineupRows.filter(r => liveEventIds.has(r.event_id)).map(r => r.artist_id))]
    if (artistIds.length === 0) return { rows: [], error: null }

    const artists = await admin
      .from('artists')
      .select('slug, updated_at')
      .in('id', artistIds)
      .not('slug', 'is', null)
      .order('slug', { ascending: true })
      .limit(CATALOGUE_ROW_CAP)
    if (artists.error) return { rows: [], error: artists.error.message }

    const rows: CatalogueRow[] = []
    for (const a of (artists.data ?? []) as { slug: string | null; updated_at: string | null }[]) {
      const slug = typeof a.slug === 'string' ? a.slug.trim() : ''
      if (!slug) continue
      rows.push({ path: `/artists/${slug}`, lastModified: typeof a.updated_at === 'string' ? a.updated_at : null })
    }
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * THE COMPARISON, PURE, so the judgement is testable without a database.
 *
 * Two directions, because they are two different defects with two different
 * consequences, and one number for both would tell a reader half of what
 * happened:
 *
 *   MISSING    a row that has a page, absent from the sitemap. Google is never
 *              told the page exists. This is the quiet one.
 *   ORPHANED   a URL in the sitemap with no row behind it. Google is told to
 *              fetch a page that answers 404, which is one of the five exclusion
 *              reasons Search Console reported against this platform.
 */
export function comparePaths(
  expected: readonly string[],
  published: readonly string[],
): { missing: string[]; orphaned: string[] } {
  const inExpected = new Set(expected)
  const inPublished = new Set(published)
  return {
    missing: [...inExpected].filter(p => !inPublished.has(p)).sort(),
    orphaned: [...inPublished].filter(p => !inExpected.has(p)).sort(),
  }
}
