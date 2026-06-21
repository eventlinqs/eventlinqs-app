import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getAllCommunities, type CommunityContent, type CommunitySlug } from './data'
import { buildCommunityTagOrFilter } from './tag-bridge'

export interface CommunityIndexEntry {
  slug: CommunitySlug
  displayName: string
  tier: 1 | 2
  tagline: string
  /** Live upcoming-event count. 0 when none or when the count query fails. */
  eventCount: number
}

/**
 * Server-side data loader for the /communities index page.
 *
 * Fetches the static community taxonomy (14 entries) and joins it with the
 * live upcoming-event count per community. Counts are derived through the
 * tag-bridge: each community maps to a set of identifying tag tokens, and
 * we count `events` rows whose `tags` jsonb array contains any of them,
 * filtered to status=published, visibility=public, start_date>=now. The
 * legacy category-bridge resolved every community to zero (live events
 * carry generic categories), which made this index read "Coming soon"
 * for all 14 communities. See src/lib/communities/tag-bridge.ts.
 *
 * Result is cached for 5 minutes (matches the ISR cadence used across
 * `/community/[community]`, `/city/[slug]`, and `/events/[slug]`). The cache
 * key is keyed on the community slugs only; the dataset shape is stable.
 *
 * Returns the 14 entries in marketed-rhythm order (the order
 * `getAllCommunities()` returns), grouped by tier downstream.
 */
async function getCommunityIndexEntriesRaw(): Promise<CommunityIndexEntry[]> {
  const communities = getAllCommunities()
  const supabase = createPublicClient()

  const counts: Record<CommunitySlug, number> = {} as Record<CommunitySlug, number>
  const nowIso = new Date().toISOString()
  await Promise.all(
    communities.map(async (c: CommunityContent) => {
      const tagOr = buildCommunityTagOrFilter(c.slug)
      if (tagOr === null) {
        counts[c.slug] = 0
        return
      }
      // Exact head count: published, public, upcoming events whose tags
      // jsonb array contains any identifying token for this community.
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

  return communities.map(c => ({
    slug: c.slug,
    displayName: c.displayName,
    tier: c.tier,
    tagline: c.tagline,
    eventCount: counts[c.slug] ?? 0,
  }))
}

const cached = unstable_cache(
  getCommunityIndexEntriesRaw,
  ['community-index-page-v1'],
  { revalidate: 300, tags: ['communities-index'] },
)

export async function getCommunityIndexEntries(): Promise<CommunityIndexEntry[]> {
  try {
    return await cached()
  } catch {
    // Network or auth failure: degrade to taxonomy with zero counts.
    return getAllCommunities().map(c => ({
      slug: c.slug,
      displayName: c.displayName,
      tier: c.tier,
      tagline: c.tagline,
      eventCount: 0,
    }))
  }
}
