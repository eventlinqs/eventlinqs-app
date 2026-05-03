import { fetchPopularThisWeekPublic } from '@/lib/events'
import { RecommendedRail } from './m5-recommended-rail'

type Props = {
  filterActive: boolean
  city?: string
  /** Override the rail's "See all" link target. Defaults to /events?sort=popular. */
  seeAllHref?: string
}

/**
 * ISR-friendly popular rail rendered synchronously in the /events shell
 * (no auth lookup, no Suspense boundary). The rail's first card is the LCP
 * candidate on /events; rendering it in the shell rather than inside a
 * Suspense boundary lets Lighthouse discover the `priority` preload during
 * HTML parse instead of after the streamed chunk arrives.
 *
 * Personalisation (organisers/categories the signed-in user saved) is
 * intentionally dropped from the shell render. A signed-in client can
 * upgrade to /api/events/recommended via a non-blocking effect later if
 * the product wants the personalised override.
 */
export async function EventsPopularSection({ filterActive, city, seeAllHref }: Props) {
  if (filterActive) return null

  const events = await fetchPopularThisWeekPublic(12, city)
  if (events.length === 0) return null

  return <RecommendedRail events={events} headline="popular" seeAllHref={seeAllHref} />
}
