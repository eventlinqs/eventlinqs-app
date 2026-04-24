import { fetchRecommendedEvents } from '@/lib/events'
import { RecommendedRail } from './m5-recommended-rail'

type Props = {
  userId: string | null
  filterActive: boolean
  cityName: string
  seeAllHref: string
}

/**
 * Suspense boundary target for /events/browse/[city] recommendations.
 * Mirrors EventsRecommendedSection but scopes the fetch to a specific
 * city so the rail is deterministically about that city's culture.
 */
export async function EventsBrowseRecommendedSection({
  userId,
  filterActive,
  cityName,
  seeAllHref,
}: Props) {
  if (filterActive) return null

  const events = await fetchRecommendedEvents(userId, 12, cityName)
  const headline: 'recommended' | 'popular' | null =
    events.length === 0 ? null : userId ? 'recommended' : 'popular'

  return <RecommendedRail events={events} headline={headline} seeAllHref={seeAllHref} />
}
