import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { EventCard } from '@/components/features/events/event-card'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import type { EventCardData } from '@/components/features/events/event-card'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'

interface Props {
  communitySlug: string
  communityName: string
  events: EventCardData[]
}

/**
 * AllEventsGridByCommunity - the main events surface for /community/[slug].
 *
 * Renders up to 12 cards in a responsive grid. When the community
 * scene has no live events on the platform yet, shows one honest line and a
 * link to real events (EmptyCollectionNote; the directive of 31 October 2026,
 * section 11), never a promotional card.
 */
export function AllEventsGridByCommunity({
  communitySlug,
  communityName,
  events,
}: Props) {
  return (
    <ContentSection
      surface="base"
      width="wide"
      topBorder
      reveal
      intrinsicSize={eventGridIntrinsicSize(events.length)}
    >
      {events.length > 0 ? (
        <>
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                On now
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Live {communityName} events
              </h2>
            </div>
            <Link
              href={`/events?community=${communitySlug}`}
              // brand-accent (gold-400) on white was 1.86:1 (WCAG fail).
              // brand-accent-strong (gold-800) is the documented
              // white-surface variant in globals.css (see the comment on
              // --brand-accent-strong). Matches the sibling "On now"
              // eyebrow above, which already uses the -strong token.
              className="shrink-0 text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--brand-accent-strong-hover)]"
            >
              View all &rsaquo;
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      ) : (
        <EmptyCollectionNote message={`No ${communityName} events are listed yet.`} />
      )}
    </ContentSection>
  )
}
