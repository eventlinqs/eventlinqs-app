import { SnapRail } from '@/components/ui/snap-rail'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

interface Props {
  events: BentoEvent[]
}

export async function ThisWeekSection({ events }: Props) {
  if (events.length === 0) return null

  const cards = await Promise.all(
    events.map(async e => <ThisWeekCard key={e.id} event={e} />),
  )

  return (
    <section aria-label="This week" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="This week"
          title="What's happening near you"
          headerLink={{ href: '/events?date=week', label: 'View all' }}
          railLabel="Events this week"
          containerBg="canvas"
        >
          {cards}
        </SnapRail>
      </div>
    </section>
  )
}
