import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { InvitationCard, invitationFillCount } from '@/components/features/events/invitation-card'
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
  /** Optional empty-state copy. When set and events is empty, renders the empty card; otherwise hides the section. */
  emptyTitle?: string
  emptyBody?: string
  /**
   * Subject word for the invitation-card copy ("The next {subject} night
   * here is yours"). Defaults to the railLabel with a trailing "events"
   * stripped; pass explicitly when the label does not start with the
   * subject (e.g. "Events this weekend").
   */
  invitationSubject?: string
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
  emptyTitle,
  emptyBody,
  invitationSubject,
}: Props) {
  if (events.length === 0 && !emptyTitle) return null

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
          {events.length > 0 ? (
            <>
              {events.map((e, i) => (
                <ThisWeekCard
                  key={e.id}
                  event={e}
                  variant={leadFeature && i === 0 ? 'feature' : cardVariant}
                />
              ))}
              {/* Launch-day sparse-rail discipline: a thin rail tops up with
                  invitation cards (visually distinct, auto-vanish once five
                  or more real events fill the track). The second invitation
                  carries the performer angle. */}
              {Array.from({ length: invitationFillCount(events.length) }, (_, i) => (
                <InvitationCard
                  key={`invite-${i}`}
                  variant={cardVariant === 'feature' ? 'landscape' : cardVariant}
                  angle={i === 1 ? 'performer' : 'organiser'}
                  subject={invitationSubject ?? (railLabel.toLowerCase().replace(/\s*events?\s*$/i, '') || 'community')}
                />
              ))}
            </>
          ) : (
            <div className="flex w-full max-w-md flex-col items-start gap-2 rounded-lg border border-dashed border-[var(--surface-2)] bg-[var(--surface-0)] p-6">
              <p className="font-headline text-sm font-bold text-[var(--text-primary)]">{emptyTitle}</p>
              {emptyBody && <p className="text-xs text-[var(--text-secondary)]">{emptyBody}</p>}
            </div>
          )}
        </SnapRail>
      </Reveal>
    </section>
  )
}
