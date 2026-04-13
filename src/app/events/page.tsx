import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Event, EventCategory } from '@/types/database'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { EventsFilterStrip } from '@/components/features/events/events-filter-strip'
import { FilterSidebar } from '@/components/features/events/filter-sidebar'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { Search } from 'lucide-react'

type Props = {
  searchParams: Promise<{
    category?: string
    city?: string
    date?: string
    free?: string
    culture?: string
    q?: string
    page?: string
  }>
}

const PAGE_SIZE = 12

export default async function EventsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  // Fetch categories — only active ones, ordered
  const { data: categories } = await supabase
    .from('event_categories')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('sort_order') as { data: Pick<EventCategory, 'id' | 'name' | 'slug'>[] | null }

  // Build events query
  let query = supabase
    .from('events')
    .select(
      'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
      { count: 'exact' },
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('start_date', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (params.q) {
    query = query.ilike('title', `%${params.q}%`)
  }
  if (params.category) {
    query = query.eq('category_id', params.category)
  }
  if (params.city) {
    query = query.ilike('venue_city', `%${params.city}%`)
  }
  if (params.free === '1') {
    query = query.eq('ticket_tiers.price', 0)
  }
  if (params.culture) {
    query = query.contains('tags', [params.culture])
  }

  const now = new Date().toISOString()
  if (params.date === 'today') {
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    query = query.gte('start_date', now).lte('start_date', endOfDay.toISOString())
  } else if (params.date === 'week') {
    const end = new Date()
    end.setDate(end.getDate() + 7)
    query = query.gte('start_date', now).lte('start_date', end.toISOString())
  } else if (params.date === 'month') {
    const end = new Date()
    end.setDate(end.getDate() + 30)
    query = query.gte('start_date', now).lte('start_date', end.toISOString())
  } else if (params.date === 'weekend') {
    const today = new Date()
    const day = today.getDay()
    let sat: Date
    if (day === 6) {
      sat = new Date(today); sat.setHours(0, 0, 0, 0)
    } else if (day === 0) {
      sat = new Date(today); sat.setDate(today.getDate() - 1); sat.setHours(0, 0, 0, 0)
    } else {
      sat = new Date(today); sat.setDate(today.getDate() + (6 - day)); sat.setHours(0, 0, 0, 0)
    }
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    sun.setHours(23, 59, 59, 999)
    query = query.gte('start_date', sat.toISOString()).lte('start_date', sun.toISOString())
  } else {
    query = query.gte('start_date', now)
  }

  const { data: eventsRaw, count } = await query

  const events = (eventsRaw ?? []) as unknown as EventCardData[]

  // Dynamic price map for cheapest tier of each event
  const cheapestTierIds = events
    .map(e => {
      const tiers = e.ticket_tiers
      if (!tiers || tiers.length === 0) return null
      return tiers.reduce((min, t) => t.price < min.price ? t : min, tiers[0]).id
    })
    .filter((id): id is string => id !== null)

  const dynamicPrices = await getDynamicPriceMap(cheapestTierIds)

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = { ...params, ...overrides }
    const qs = Object.entries(p)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join('&')
    return `/events${qs ? '?' + qs : ''}`
  }

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      {/* ── Page header + search ────────────────────────────────── */}
      <div className="border-b border-ink-100 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-700 text-ink-900 sm:text-4xl">
            Discover Events
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {count ?? 0} event{(count ?? 0) !== 1 ? 's' : ''} available
          </p>

          {/* Search bar — spec §6.9 */}
          <form method="GET" className="mt-5">
            <div className="flex gap-2 max-w-2xl">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                  aria-hidden="true"
                />
                <input
                  name="q"
                  defaultValue={params.q}
                  type="search"
                  placeholder="Search events, artists, venues…"
                  className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400 transition-colors"
                />
              </div>
              {/* Preserve other active filters through search submit */}
              {params.category && <input type="hidden" name="category" value={params.category} />}
              {params.city && <input type="hidden" name="city" value={params.city} />}
              {params.date && <input type="hidden" name="date" value={params.date} />}
              {params.free && <input type="hidden" name="free" value={params.free} />}
              {params.culture && <input type="hidden" name="culture" value={params.culture} />}
              <button
                type="submit"
                className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Mobile chip strip — hidden on lg+ */}
        <EventsFilterStrip
          categories={categories ?? []}
          params={params}
          resultsCount={count ?? 0}
        />

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Desktop sidebar */}
          <FilterSidebar categories={categories ?? []} params={params} />

          {/* Event grid */}
          <div className="flex-1 min-w-0">
            {!events || events.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 py-24 text-center">
                <p className="text-sm text-ink-400">No events found matching your filters.</p>
                <Link
                  href="/events"
                  className="mt-3 text-sm font-medium text-gold-500 hover:text-gold-600 hover:underline"
                >
                  Clear all filters
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {events.map(event => (
                  <EventCard key={event.id} event={event} dynamicPrices={dynamicPrices} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                {page > 1 && (
                  <Link
                    href={buildUrl({ page: String(page - 1) })}
                    className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-sm text-ink-400">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildUrl({ page: String(page + 1) })}
                    className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
