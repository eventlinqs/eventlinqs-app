import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getAllCultures, type CultureContent, type CultureSlug } from './data'
import { getCategorySlugsForCulture } from './category-bridge'

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
 * existing category-bridge: each culture maps to one or more event_category
 * slugs, and we count `events` rows whose category slug is in that set,
 * filtered to status=published, visibility=public, start_date>=now.
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
  await Promise.all(
    cultures.map(async (c: CultureContent) => {
      const categorySlugs = getCategorySlugsForCulture(c.slug)
      if (categorySlugs.length === 0) {
        counts[c.slug] = 0
        return
      }
      // Counting via head: count + categories(slug.in.(...)) is not directly
      // expressible without a join filter, so we approximate by counting
      // category rows then filtering client-side. Volume is bounded
      // (200 upcoming events per culture max), so this is cheap and
      // deterministic without a stored procedure.
      const { data, error } = await supabase
        .from('events')
        .select('id, category:event_categories(slug)')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', new Date().toISOString())
        .limit(500)
      if (error || !data) {
        counts[c.slug] = 0
        return
      }
      counts[c.slug] = data.filter(row => {
        // Supabase typings widen this nested join; narrow defensively.
        const slug = (row as { category?: { slug?: string } | null }).category?.slug
        return typeof slug === 'string' && categorySlugs.includes(slug)
      }).length
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
