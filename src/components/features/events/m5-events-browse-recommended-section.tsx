import { createClient } from '@/lib/supabase/server'
import { fetchRecommendedEvents } from '@/lib/events'
import { RecommendedRail } from './m5-recommended-rail'

type Props = {
  filterActive: boolean
  cityName: string
  seeAllHref: string
}

/**
 * Suspense boundary target for /events/browse/[city] recommendations.
 * Owns its own auth lookup so the enclosing shell stays cookies-free
 * and Next.js can treat the page as cacheable under ISR.
 */
export async function EventsBrowseRecommendedSection({
  filterActive,
  cityName,
  seeAllHref,
}: Props) {
  if (filterActive) return null

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const events = await fetchRecommendedEvents(userId, 12, cityName)
  const headline: 'recommended' | 'popular' | null =
    events.length === 0 ? null : userId ? 'recommended' : 'popular'

  return <RecommendedRail events={events} headline={headline} seeAllHref={seeAllHref} />
}
