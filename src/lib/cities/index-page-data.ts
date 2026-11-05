import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getAllCities, type CityContent, type CitySlug } from './data'
import { EVENT_DATA_CACHE_TAGS } from '@/lib/events/cache-tags'
import { eventsPerCityName, readListedRows, type CountReadClient } from '@/lib/events/event-counts'

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
 * Result cached for 5 minutes (same cadence as the communities index).
 */
async function getCityIndexEntriesRaw(): Promise<CityIndexEntry[]> {
  const cities: CityContent[] = getAllCities()
  const supabase = createPublicClient()

  // EVENTS, never dates (the CONTROLLER's 08:50 (2): the audit read 'Bendigo VIC 174 events' over the 89 events its
  // guide counts): every listed row read once, each city's events counted by the guide's eventKey, the same venue_city
  // match as before. A failed read throws, and getCityIndexEntries answers with its zero-count fallback.
  const perCity = eventsPerCityName(await readListedRows(supabase as unknown as CountReadClient, new Date()), cities.map((c) => c.name))
  const counts: Record<CitySlug, number> = {} as Record<CitySlug, number>
  for (const c of cities) counts[c.slug] = perCity.get(c.name) ?? 0

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
  { revalidate: 300, tags: [EVENT_DATA_CACHE_TAGS[3]] },
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
