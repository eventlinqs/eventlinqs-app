import Link from 'next/link'
import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'
import { EventCard } from './event-card'
import { DragRail } from '@/components/ui/drag-rail'

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
    <section aria-labelledby="m5-rec-heading" className="border-b border-ink-100 bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2
            id="m5-rec-heading"
            className="font-display text-lg font-bold text-ink-900 sm:text-xl"
          >
            {title}
          </h2>
          <Link
            href={seeAllHref}
            className="shrink-0 text-xs font-semibold text-accent hover:underline sm:text-sm"
          >
            See all
          </Link>
        </div>
        <DragRail
          className="mt-4 -mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 scrollbar-none"
          ariaLabel={title}
          testId="m5-rec-rail"
        >
          {cards.map((c, i) => (
            <li
              key={c.id}
              className="w-64 shrink-0 snap-start sm:w-72"
            >
              <EventCard event={c} priority={i === 0} />
            </li>
          ))}
        </DragRail>
      </div>
    </section>
  )
}
