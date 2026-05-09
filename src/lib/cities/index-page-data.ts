import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getAllCities, type CityContent, type CitySlug } from './data'

export interface CityIndexEntry {
  slug: CitySlug
  name: string
  state: string
  region: string
  tier: 1 | 2
  descriptor: string
  /** Live upcoming-event count. 0 on miss. */
  eventCount: number
}

/**
 * Server-side data loader for the /cities index page.
 *
 * Joins the static city taxonomy (20 entries) with the live upcoming-event
 * count per city via `events.venue_city` ILIKE match. Each city's event
 * count is the number of published, future events whose venue_city
 * contains the city's name (case-insensitive). The match is intentionally
 * permissive because venue_city is free-text in the events table and
 * covers metro variants like "Sydney CBD" / "Sydney Harbour" as Sydney.
 *
 * Result cached for 5 minutes (same cadence as the cultures index).
 */
async function getCityIndexEntriesRaw(): Promise<CityIndexEntry[]> {
  const cities: CityContent[] = getAllCities()
  const supabase = createPublicClient()

  const counts: Record<CitySlug, number> = {} as Record<CitySlug, number>
  await Promise.all(
    cities.map(async (c: CityContent) => {
      const { count, error } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', new Date().toISOString())
        .ilike('venue_city', `%${c.name}%`)
      counts[c.slug] = error || count === null ? 0 : count
    }),
  )

  return cities.map(c => ({
    slug: c.slug,
    name: c.name,
    state: c.state,
    region: c.region,
    tier: c.tier,
    descriptor: c.descriptor,
    eventCount: counts[c.slug] ?? 0,
  }))
}

const cached = unstable_cache(
  getCityIndexEntriesRaw,
  ['city-index-page-v1'],
  { revalidate: 300, tags: ['cities-index'] },
)

export async function getCityIndexEntries(): Promise<CityIndexEntry[]> {
  try {
    return await cached()
  } catch {
    return getAllCities().map(c => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      region: c.region,
      tier: c.tier,
      descriptor: c.descriptor,
      eventCount: 0,
    }))
  }
}
