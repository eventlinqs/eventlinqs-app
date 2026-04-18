import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { EventCategory } from '@/types/database'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { detectLocation } from '@/lib/geo/detect'
import { EventsFilterStrip } from '@/components/features/events/events-filter-strip'
import { FilterSidebar } from '@/components/features/events/filter-sidebar'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import { EventBentoTile, type BentoEvent } from '@/components/features/events/event-bento-tile'
import { FeaturedEventHero, type FeaturedHeroEvent } from '@/components/features/events/featured-event-hero'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { Search } from 'lucide-react'

type Props = {
  searchParams: Promise<{
    category?: string
    city?: string
    date?: string
    free?: string
    paid?: string
    distance?: string
    q?: string
    page?: string
  }>
}

const PAGE_SIZE = 12

type ListRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  start_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  created_at: string
  is_free: boolean | null
  category: { name: string; slug: string } | null
  organisation?: { name: string } | null
  ticket_tiers: {
    id: string
    price: number
    currency: string
    sold_count: number
    reserved_count: number
    total_capacity: number
  }[]
}

function toBentoEvent(r: ListRow): BentoEvent {
  const tiers = r.ticket_tiers ?? []
  const sold = tiers.reduce((s, t) => s + t.sold_count, 0)
  const cap = tiers.reduce((s, t) => s + t.total_capacity, 0)
  const percent_sold = cap > 0 ? Math.round((sold / cap) * 100) : null
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    cover_image_url: r.cover_image_url,
    thumbnail_url: r.thumbnail_url,
    gallery_urls: r.gallery_urls,
    start_date: r.start_date,
    venue_name: r.venue_name,
    venue_city: r.venue_city,
    is_free: r.is_free,
    category: r.category,
    ticket_tiers: tiers.map(t => ({ price: t.price, currency: t.currency })),
    percent_sold,
  }
}

export default async function EventsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('event_categories')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('sort_order') as { data: Pick<EventCategory, 'id' | 'name' | 'slug'>[] | null }

  // Determine whether any filter is active — if not, render featured hero
  const hasFilters = Boolean(
    params.q || params.category || params.city || params.date ||
      params.free === '1' || params.paid === '1' || params.distance,
  )

  let query = supabase
    .from('events')
    .select(
      'id, slug, title, summary, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), organisation:organisations(name), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
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
    const { data: cat } = await supabase
      .from('event_categories')
      .select('id')
      .eq('slug', params.category)
      .maybeSingle()

    if (cat) {
      query = query.eq('category_id', cat.id)
    } else {
      query = query.eq('category_id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (params.city) {
    query = query.ilike('venue_city', `%${params.city}%`)
  }
  if (params.free === '1') {
    query = query.eq('is_free', true)
  }
  if (params.paid === '1') {
    query = query.eq('is_free', false)
  }

  if (params.distance) {
    const { latitude, longitude } = await detectLocation()
    const radius = parseFloat(params.distance)
    if (latitude !== null && longitude !== null && Number.isFinite(radius) && radius > 0) {
      const { data: nearby } = await supabase.rpc('events_within_distance', {
        p_lat: latitude,
        p_lng: longitude,
        p_radius_km: radius,
      })
      const nearbyIds = (nearby ?? []).map((e: { id: string }) => e.id)
      if (nearbyIds.length > 0) {
        query = query.in('id', nearbyIds)
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    }
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

  const rows = (eventsRaw ?? []) as unknown as ListRow[]
  const events = rows as unknown as EventCardData[]

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

  // Featured hero: the soonest event, shown only on page 1 with no filters active.
  const showFeaturedHero = !hasFilters && page === 1 && rows.length > 0
  const featuredHero: FeaturedHeroEvent | null = showFeaturedHero
    ? { ...toBentoEvent(rows[0]), organisation: rows[0].organisation ?? null }
    : null

  // Remaining events for the grid. If we rendered the featured as hero, skip row 0.
  const gridRows = showFeaturedHero ? rows.slice(1) : rows
  const gridEventCards = gridRows as unknown as EventCardData[]

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      {showFeaturedHero && featuredHero && (
        <FeaturedEventHero event={featuredHero} />
      )}

      <div className="border-b border-ink-100 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
            Discover Events
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {count ?? 0} event{(count ?? 0) !== 1 ? 's' : ''} available
          </p>

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
                  placeholder="Search events, artists, venues\u2026"
                  className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
                />
              </div>
              {params.category && <input type="hidden" name="category" value={params.category} />}
              {params.city && <input type="hidden" name="city" value={params.city} />}
              {params.date && <input type="hidden" name="date" value={params.date} />}
              {params.free && <input type="hidden" name="free" value={params.free} />}
              {params.paid && <input type="hidden" name="paid" value={params.paid} />}
              {params.distance && <input type="hidden" name="distance" value={params.distance} />}
              <button
                type="submit"
                className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EventsFilterStrip
          categories={categories ?? []}
          params={params}
          resultsCount={count ?? 0}
        />

        <div className="flex flex-col gap-8 lg:flex-row">
          <FilterSidebar categories={categories ?? []} params={params} />

          <div className="flex-1 min-w-0">
            {!gridEventCards || gridEventCards.length === 0 ? (
              showFeaturedHero ? null : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 py-24 text-center">
                  <p className="text-sm text-ink-400">No events found matching your filters.</p>
                  <Link
                    href="/events"
                    className="mt-3 text-sm font-medium text-gold-500 hover:text-gold-600 hover:underline"
                  >
                    Clear all filters
                  </Link>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-6 [grid-auto-flow:dense] sm:grid-cols-2 xl:grid-cols-3">
                {gridEventCards.map((event, idx) => {
                  // Lazy bento: every 7th event (when there are at least 4 surrounding events)
                  // spans 2 cols × 2 rows and renders as EventBentoTile for editorial punch.
                  const isFeatureCell = idx % 7 === 0 && idx !== 0 && gridEventCards.length - idx >= 3
                  if (isFeatureCell) {
                    const bento = toBentoEvent(gridRows[idx])
                    return (
                      <div
                        key={event.id}
                        className="relative min-h-[380px] overflow-hidden rounded-xl sm:col-span-2 sm:row-span-2"
                      >
                        <EventBentoTile event={bento} size="wide" featured />
                      </div>
                    )
                  }
                  return (
                    <EventCard
                      key={event.id}
                      event={event}
                      dynamicPrices={dynamicPrices}
                    />
                  )
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                {page > 1 && (
                  <Link
                    href={buildUrl({ page: String(page - 1) })}
                    className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
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
                    className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
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
