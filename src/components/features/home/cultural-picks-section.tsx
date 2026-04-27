import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { CulturalPicksRail } from '@/components/features/events/cultural-picks-rail'
import { ThisWeekCard } from '@/components/features/events/this-week-card'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import {
  CULTURE_TABS,
  EVENT_SELECT,
  toBentoEvent,
  type RawRow,
} from '@/lib/events/home-queries'

interface Props {
  cityFilter: string
  nowIso: string
}

export async function CulturalPicksSection({ cityFilter, nowIso }: Props) {
  const supabase = createPublicClient()

  const culturalQueries = await Promise.all(
    CULTURE_TABS.map(async tab => {
      let { data } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', nowIso)
        .contains('tags', [tab.tag])
        .ilike('venue_city', `%${cityFilter}%`)
        .order('start_date', { ascending: true })
        .limit(8)
      if ((data ?? []).length < 2) {
        const result = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('status', 'published')
          .eq('visibility', 'public')
          .gte('start_date', nowIso)
          .contains('tags', [tab.tag])
          .order('start_date', { ascending: true })
          .limit(8)
        data = result.data
      }
      const events = ((data ?? []) as unknown as RawRow[]).map(toBentoEvent)
      const cards = await Promise.all(events.map(async e => <ThisWeekCard key={e.id} event={e} />))
      return { tab, events, cards }
    }),
  )

  const culturalPicksTabs = culturalQueries
    .filter(q => q.events.length > 0)
    .map(q => ({
      slug: q.tab.slug,
      label: q.tab.label,
      href: q.tab.href,
      cards: <>{q.cards}</>,
    }))

  if (culturalPicksTabs.length === 0) return null

  return (
    <section aria-labelledby="culture-heading" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
                Made for the diaspora
              </p>
              <h2 id="culture-heading" className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                Cultural picks
              </h2>
            </div>
          </div>
          <Link
            href="/events"
            className="shrink-0 text-sm font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
          >
            Explore culture &rsaquo;
          </Link>
        </div>

        <CulturalPicksRail tabs={culturalPicksTabs} />
      </div>
    </section>
  )
}
