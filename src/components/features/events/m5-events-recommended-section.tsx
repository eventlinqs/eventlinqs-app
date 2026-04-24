import { createClient } from '@/lib/supabase/server'
import { fetchRecommendedEvents } from '@/lib/events'
import { RecommendedRail } from './m5-recommended-rail'

type Props = {
  filterActive: boolean
}

/**
 * Suspense boundary target: performs its own auth lookup + fetch so the
 * /events shell stays free of cookies() and can be treated as static by
 * the Next.js renderer (ISR honours `revalidate` only when no dynamic
 * APIs are used in the shell). PSI cache-bust queries (?v=...) still
 * share the cached HTML once the first run warms the CDN.
 */
export async function EventsRecommendedSection({ filterActive }: Props) {
  if (filterActive) return null

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const events = await fetchRecommendedEvents(userId, 12)
  const headline: 'recommended' | 'popular' | null =
    events.length === 0 ? null : userId ? 'recommended' : 'popular'

  return <RecommendedRail events={events} headline={headline} />
}
