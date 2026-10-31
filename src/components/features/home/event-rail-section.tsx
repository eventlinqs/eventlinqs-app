import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP } from '@/lib/ui/rhythm'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

interface Props {
  eyebrow: string
  title: string
  ariaLabel: string
  railLabel: string
  events: BentoEvent[]
  viewAllHref: string
  /** Card template for this rail. Default 'landscape'. Genre/trending use 'square', feature rows use 'feature'. */
  cardVariant?: 'landscape' | 'square' | 'feature'
  /** Render the first card as a wide feature lead (a single hero rail). */
  leadFeature?: boolean
  /** Tailwind gap utility for the scroll track. Defaults to the rhythm gap. */
  cardGap?: string
}

export async function EventRailSection({
  eyebrow,
  title,
  ariaLabel,
  railLabel,
  events,
  viewAllHref,
  cardVariant = 'landscape',
  leadFeature = false,
  cardGap = RHYTHM_GAP,
}: Props) {
  /*
   * ONE REAL EVENT, ONE CARD (Lawal's emergency correction, 31 October 2026, 17:44): a rail draws only real published
   * events, fewer cards when inventory is thin, and an empty rail is hidden. No open-slot card, invitation or empty-state
   * card ever takes a place in it; scripts/guards/no-filler-in-event-collections.mjs fails the build if one returns.
   */
  if (events.length === 0) return null

  return (
    <section aria-label={ariaLabel} className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}>
      {/* The whole rail (heading + cards) fade-rises as one block when it
       *  scrolls into view. The divider stays put; content rises into it. */}
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow={eyebrow}
          title={title}
          headerLink={{ href: viewAllHref, label: 'View all' }}
          railLabel={railLabel}
          containerBg="canvas"
          cardGap={cardGap}
        >
          {events.map((e, i) => (
            <ThisWeekCard
              key={e.id}
              event={e}
              variant={leadFeature && i === 0 ? 'feature' : cardVariant}
            />
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
