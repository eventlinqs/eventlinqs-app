import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'
import { EventCard } from './event-card'
import { SnapRailScroller } from '@/components/ui/snap-rail'

type Props = {
  events: PublicEventRow[]
  headline: 'recommended' | 'popular' | null
  seeAllHref?: string
}

const MIN_RAIL_COUNT = 3
const MAX_RAIL_COUNT = 8

/**
 * Horizontal rail of Recommended / Popular events rendered above the
 * main grid. Uses the shared EventCard so social-proof badges and the
 * Pexels cascade match the main grid.
 *
 * Rendering is gated two ways:
 *   1. `headline === null` → caller decided not to show the rail (e.g.
 *      filters are active on the browsing surface).
 *   2. `events.length < MIN_RAIL_COUNT` → sparse data wouldn't read as a
 *      rail. Stay silent instead.
 */
export async function RecommendedRail({
  events,
  headline,
  seeAllHref = '/events?sort=popular',
}: Props) {
  if (headline === null) return null
  if (events.length < MIN_RAIL_COUNT) return null

  const top = events.slice(0, MAX_RAIL_COUNT)
  const title = headline === 'recommended' ? 'Recommended for you' : 'Popular this week'
  const cards = await projectToCardData(top)

  return (
    <section aria-labelledby="m5-rec-heading" data-testid="m5-rec-rail" className="border-b border-ink-100 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Shared rail: SnapRailScroller supplies the canonical Rail Control
            System (header-anchored 44px arrows, drag-to-scroll, snap armed on
            first engagement so the load-time re-snap never stops LCP, keyboard).
            data-testid kept for the existing e2e selector. */}
        <SnapRailScroller
          railLabel={title}
          header={{ title, headingId: 'm5-rec-heading', headerLink: { href: seeAllHref, label: 'See all' } }}
        >
          {cards.map((c, i) => (
            <div
              key={c.id}
              className="w-64 shrink-0 snap-start sm:w-72"
            >
              {/*
                The first rail card consistently wins the LCP race on
                /events and /events/browse/[city] because the recommended
                rail renders above the main grid in DOM order and the
                EventsHeroStrip is text-only. Marking the first rail card
                priority gives it fetchpriority="high", loading="eager", and
                an auto-injected <link rel="preload"> so the LCP candidate is
                fetched during HTML parse instead of after IntersectionObserver
                catches up.
              */}
              <EventCard event={c} variant="rail" priority={i === 0} />
            </div>
          ))}
        </SnapRailScroller>
      </div>
    </section>
  )
}
