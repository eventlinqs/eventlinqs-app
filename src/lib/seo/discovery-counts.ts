import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { EVENT_DATA_CACHE_TAGS } from '@/lib/events/cache-tags'
import type { DiscoveryEventRow } from './discovery-matchers'

/**
 * HOW MANY PUBLICLY VISIBLE EVENTS EACH TEMPLATED DISCOVERY PAGE HOLDS.
 *
 * ============================================================================
 * WHY ONE QUERY AND PURE MATCHERS, RATHER THAN A COUNT QUERY PER PAGE
 * ============================================================================
 *
 * The indexing policy (src/lib/seo/indexing-policy.ts) needs this number in two
 * places: on the PAGE, which decides its own robots directive from it, and in
 * the SITEMAP, which decides whether to publish that URL at all. Those two must
 * never disagree, because a sitemap that advertises a noindex URL is exactly the
 * contradiction Search Console reports back as an exclusion.
 *
 * The sitemap needs about 490 of these numbers on one request (21 communities,
 * 420 community-by-city intersections, 24 cities, their suburbs, 22 browse
 * cities, the categories and the faiths). Asking the database 490 times would be
 * 490 round trips inside one route, and it would also give the sitemap a SECOND
 * implementation of every matching rule, free to drift from the page's.
 *
 * So there is one query, returning the dimension columns of every publicly
 * visible event, and every count is a PURE FUNCTION over those rows. The page
 * and the sitemap call the same function with the same rows, so they cannot
 * disagree with each other by construction.
 *
 * THE ONE RISK THIS LEAVES, AND WHAT HOLDS IT. These matchers mirror SQL written
 * on the pages (`tags.cs.[...]`, `venue_city ilike %name%`, `category.slug in
 * (...)`). A matcher could drift from the query it mirrors.
 * scripts/verify/discovery-counts-agree.mjs runs BOTH against the linked
 * database, for every community, city, category and faith, and fails on a single
 * disagreement. tests/unit/seo/discovery-counts.test.ts holds the shapes.
 */

const SELECT = 'tags, venue_city, suburb_primary, venue_latitude, venue_longitude, category:event_categories(slug)'

async function loadRaw(): Promise<DiscoveryEventRow[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('events')
    .select(SELECT)
    .match(PUBLIC_EVENT_MATCH)
    .or(listingWindowOrPredicate(new Date()))
    .limit(5000)

  if (error) {
    // NOT SWALLOWED. A silent catch here would make every discovery page look
    // empty and quietly drop 490 URLs out of the sitemap, which is the loudest
    // possible failure wearing the quietest possible clothes.
    console.error('[discovery-counts] events could not be read:', error)
    throw new Error(`discovery counts unavailable: ${error.message}`)
  }

  return (data ?? []).map(row => {
    const r = row as unknown as {
      tags: unknown
      venue_city: string | null
      suburb_primary: string | null
      venue_latitude: number | null
      venue_longitude: number | null
      category: { slug: string | null } | { slug: string | null }[] | null
    }
    const category = Array.isArray(r.category) ? r.category[0] : r.category
    return {
      tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
      venue_city: r.venue_city,
      suburb_primary: r.suburb_primary,
      venue_latitude: r.venue_latitude,
      venue_longitude: r.venue_longitude,
      category_slug: category?.slug ?? null,
    }
  })
}

const loadCached = unstable_cache(loadRaw, ['discovery-indexability-rows-v1'], {
  revalidate: 300,
  tags: [EVENT_DATA_CACHE_TAGS[5]],
})

/**
 * The dimension rows for every publicly visible event, cached for five minutes
 * and cleared by `revalidateEventSurfaces` on every event mutation.
 *
 * DEGRADES TO EMPTY, DELIBERATELY. If the database cannot be read, every
 * templated discovery page falls below the threshold and is reported noindex,
 * and the sitemap publishes fewer URLs for one revalidation window. The other
 * direction, guessing that a page is full when the read failed, would advertise
 * empty pages to Google, which is the defect this whole item exists to stop.
 */
export async function loadDiscoveryRows(): Promise<DiscoveryEventRow[]> {
  try {
    return await loadCached()
  } catch (err) {
    console.error('[discovery-counts] falling back to zero counts:', err)
    return []
  }
}

/*
 * The matchers and the counts live in ./discovery-matchers, which imports no
 * framework, so a script can load them outside a Next build. They are re-exported
 * here because every call site wants the rows and the counts together.
 */
export * from './discovery-matchers'
