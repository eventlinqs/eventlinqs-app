import { EventCard } from './event-card'
import type { EventCardData } from './event-card'

/**
 * RelatedEventsGrid — 4-card grid surfaced at the bottom of the event
 * detail page. Parent supplies a pre-filtered list (same category or
 * same organiser or same city, upcoming order).
 */

interface Props {
  events: EventCardData[]
  dynamicPrices?: Map<string, number>
  heading?: string
}

export function RelatedEventsGrid({
  events,
  dynamicPrices = new Map(),
  heading = 'You might also like',
}: Props) {
  if (!events.length) return null
  return (
    <section aria-labelledby="related-events-heading" className="py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-500">
              Related
            </p>
            <h2 id="related-events-heading" className="font-display text-2xl font-bold text-ink-900">
              {heading}
            </h2>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {events.slice(0, 4).map(event => (
            <EventCard key={event.id} event={event} dynamicPrices={dynamicPrices} />
          ))}
        </div>
      </div>
    </section>
  )
}
