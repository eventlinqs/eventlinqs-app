import { EventRailSection } from './event-rail-section'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

interface Props {
  events: BentoEvent[]
}

/**
 * "What's happening near you" - the this-week rail.
 *
 * Surgical fix 2026-07-12: this section used to build its own SnapRail
 * directly (a bespoke sibling that PREDATED the shared EventRailSection),
 * which is exactly why the invitation-card fill and the overflow-driven
 * scroll arrows skipped it - the launch-day sparse-rail wiring landed in
 * the shared component and this duplicate never received it. It now
 * DELEGATES to EventRailSection, so this rail behaves identically to every
 * lineup rail (same cards, same invitation top-up that vanishes at five
 * real events, same canonical arrows) and can never be skipped by a rail
 * upgrade again.
 */
export async function ThisWeekSection({ events }: Props) {
  return (
    <EventRailSection
      eyebrow="This week"
      title="What's happening near you"
      ariaLabel="This week"
      railLabel="Events this week"
      events={events}
      viewAllHref="/events?date=week"
      invitationSubject="big"
    />
  )
}
