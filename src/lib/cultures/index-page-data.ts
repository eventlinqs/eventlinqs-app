import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getAllCultures, type CultureContent, type CultureSlug } from './data'
import { buildCultureTagOrFilter } from './tag-bridge'

export interface CultureIndexEntry {
  slug: CultureSlug
  displayName: string
  tier: 1 | 2
  tagline: string
  /** Live upcoming-event count. 0 when none or when the count query fails. */
  eventCount: number
}

/**
 * Server-side data loader for the /cultures index page.
 *
 * Fetches the static culture taxonomy (14 entries) and joins it with the
 * live upcoming-event count per culture. Counts are derived through the
 * tag-bridge: each culture maps to a set of identifying tag tokens, and
 * we count `events` rows whose `tags` jsonb array contains any of them,
 * filtered to status=published, visibility=public, start_date>=now. The
 * legacy category-bridge resolved every culture to zero (live events
 * carry generic categories), which made this index read "Coming soon"
 * for all 14 cultures. See src/lib/cultures/tag-bridge.ts.
 *
 * Result is cached for 5 minutes (matches the ISR cadence used across
 * `/culture/[culture]`, `/city/[slug]`, and `/events/[slug]`). The cache
 * key is keyed on the culture slugs only; the dataset shape is stable.
 *
 * Returns the 14 entries in marketed-rhythm order (the order
 * `getAllCultures()` returns), grouped by tier downstream.
 */
async function getCultureIndexEntriesRaw(): Promise<CultureIndexEntry[]> {
  const cultures = getAllCultures()
  const supabase = createPublicClient()

  const counts: Record<CultureSlug, number> = {} as Record<CultureSlug, number>
  const nowIso = new Date().toISOString()
  await Promise.all(
    cultures.map(async (c: CultureContent) => {
      const tagOr = buildCultureTagOrFilter(c.slug)
      if (tagOr === null) {
        counts[c.slug] = 0
        return
      }
      // Exact head count: published, public, upcoming events whose tags
      // jsonb array contains any identifying token for this culture.
      const { count, error } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .or(tagOr)
      counts[c.slug] = error || count === null ? 0 : count
    }),
  )

  return cultures.map(c => ({
    slug: c.slug,
    displayName: c.displayName,
    tier: c.tier,
    tagline: c.tagline,
    eventCount: counts[c.slug] ?? 0,
  }))
}

const cached = unstable_cache(
  getCultureIndexEntriesRaw,
  ['culture-index-page-v1'],
  { revalidate: 300, tags: ['cultures-index'] },
)

export async function getCultureIndexEntries(): Promise<CultureIndexEntry[]> {
  try {
    return await cached()
  } catch {
    // Network or auth failure: degrade to taxonomy with zero counts.
    return getAllCultures().map(c => ({
      slug: c.slug,
      displayName: c.displayName,
      tier: c.tier,
      tagline: c.tagline,
      eventCount: 0,
    }))
  }
}
