import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
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
