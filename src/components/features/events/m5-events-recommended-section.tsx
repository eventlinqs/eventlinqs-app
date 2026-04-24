import { fetchRecommendedEvents } from '@/lib/events'
import { RecommendedRail } from './m5-recommended-rail'

type Props = {
  userId: string | null
  filterActive: boolean
}

/**
 * Suspense boundary target: performs its own fetch + projection so the
 * /events shell (hero, filter bar) streams immediately while the rail
 * resolves Pexels fallbacks for up to 8 events.
 */
export async function EventsRecommendedSection({ userId, filterActive }: Props) {
  if (filterActive) return null

  const events = await fetchRecommendedEvents(userId, 12)
  const headline: 'recommended' | 'popular' | null =
    events.length === 0 ? null : userId ? 'recommended' : 'popular'

  return <RecommendedRail events={events} headline={headline} />
}
