import { SnapRail } from '@/components/ui/snap-rail'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

interface Props {
  eyebrow: string
  title: string
  ariaLabel: string
  railLabel: string
  events: BentoEvent[]
  viewAllHref: string
  /** Optional empty-state copy. When set and events is empty, renders the empty card; otherwise hides the section. */
  emptyTitle?: string
  emptyBody?: string
}

export async function EventRailSection({
  eyebrow,
  title,
  ariaLabel,
  railLabel,
  events,
  viewAllHref,
  emptyTitle,
  emptyBody,
}: Props) {
  if (events.length === 0 && !emptyTitle) return null

  return (
    <section aria-label={ariaLabel} className={`border-t border-ink-200 bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow={eyebrow}
          title={title}
          headerLink={{ href: viewAllHref, label: 'View all' }}
          railLabel={railLabel}
          containerBg="canvas"
        >
          {events.length > 0 ? (
            events.map(e => <ThisWeekCard key={e.id} event={e} />)
          ) : (
            <div className="flex w-full max-w-md flex-col items-start gap-2 rounded-lg border border-dashed border-[var(--surface-2)] bg-[var(--surface-0)] p-6">
              <p className="font-display text-sm font-bold text-[var(--text-primary)]">{emptyTitle}</p>
              {emptyBody && <p className="text-xs text-[var(--text-secondary)]">{emptyBody}</p>}
            </div>
          )}
        </SnapRail>
      </div>
    </section>
  )
}
