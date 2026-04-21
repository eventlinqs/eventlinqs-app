import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicEvents, fetchRecommendedEvents } from '@/lib/events'
import {
  parseEventsSearchParams,
  type EventsSearchParams,
} from '@/lib/events/search-params'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventsHeroStrip } from '@/components/features/events/m5-events-hero-strip'
import { EventsFilterBar } from '@/components/features/events/m5-events-filter-bar'
import { RecommendedRail } from '@/components/features/events/m5-recommended-rail'
import { EventsGrid } from '@/components/features/events/m5-events-grid'
import { EventsPagination } from '@/components/features/events/m5-events-pagination'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Discover events | EventLinqs',
  description:
    'Browse upcoming events by date, category, city, and price. Where the culture gathers.',
}

type Props = {
  searchParams: Promise<EventsSearchParams>
}

export default async function EventsPage({ searchParams }: Props) {
  const raw = await searchParams
  const { filters, page, view } = parseEventsSearchParams(raw)

  const supabase = await createClient()
  const [{ data: categories }, { data: userData }] = await Promise.all([
    supabase
      .from('event_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.auth.getUser(),
  ])

  const userId = userData.user?.id ?? null

  const [result, recommended] = await Promise.all([
    fetchPublicEvents({ filters, page, pageSize: 24 }),
    fetchRecommendedEvents(userId, 12),
  ])

  const recHeadline: 'recommended' | 'popular' | null =
    recommended.length === 0 ? null : userId ? 'recommended' : 'popular'

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <EventsHeroStrip params={raw} total={result.total} />

        <EventsFilterBar
          params={raw}
          categories={(categories ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))}
          view={view}
        />

        <RecommendedRail events={recommended} headline={recHeadline} />

        <section aria-label="Event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <EventsGrid events={result.events} />
          <EventsPagination params={raw} page={result.page} totalPages={result.totalPages} />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
