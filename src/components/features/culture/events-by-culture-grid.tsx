import Link from 'next/link'
import { ContentSection } from '@/components/layout/ContentSection'
import { EventCard } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import type { EventCardData } from '@/components/features/events/event-card'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'

interface Props {
  cultureSlug: string
  cultureName: string
  cultureTagline: string
  events: EventCardData[]
}

/**
 * AllEventsGridByCulture - the main events surface for /culture/[slug].
 *
 * Renders up to 12 cards in a responsive grid. When the cultural
 * scene has no live events on the platform yet, shows the
 * CategoryHeroEmpty CTA card instead (same pattern as the legacy
 * /categories/[slug] page).
 */
export function AllEventsGridByCulture({
  cultureSlug,
  cultureName,
  cultureTagline,
  events,
}: Props) {
  return (
    <ContentSection surface="base" width="wide" topBorder>
      {events.length > 0 ? (
        <>
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                On now
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Live {cultureName} events
              </h2>
            </div>
            <Link
              href={`/events?culture=${cultureSlug}`}
              className="shrink-0 text-sm font-medium text-[var(--brand-accent)] transition-colors hover:text-[var(--brand-accent-hover)]"
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
        <CategoryHeroEmpty
          eyebrow={cultureName.toUpperCase()}
          headline={`The first ${cultureName} event on EventLinqs could be yours.`}
          subhead={`${cultureTagline} Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
          primaryAction={{
            label: 'Talk to us about listing',
            href: `/contact?topic=organiser&interest=${cultureSlug}`,
          }}
          secondaryAction={{
            label: 'Browse all events',
            href: '/events',
          }}
          trustPillars={[
            { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in 5 minutes' },
            { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
            { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts in 7 days' },
          ]}
        />
      )}
    </ContentSection>
  )
}
