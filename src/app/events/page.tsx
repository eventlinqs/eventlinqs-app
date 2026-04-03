import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Event, EventCategory } from '@/types/database'

type Props = {
  searchParams: Promise<{
    category?: string
    city?: string
    date?: string
    free?: string
    q?: string
    page?: string
  }>
}

const PAGE_SIZE = 12

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatPrice(tiers: { price: number; currency: string }[]) {
  if (!tiers || tiers.length === 0) return 'Free'
  const min = Math.min(...tiers.map(t => t.price))
  if (min === 0) return 'Free'
  const currency = tiers[0].currency ?? 'AUD'
  return `From ${currency} ${(min / 100).toFixed(2)}`
}

export default async function EventsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  // Fetch categories for filter
  const { data: categories } = await supabase
    .from('event_categories')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('sort_order') as { data: Pick<EventCategory, 'id' | 'name' | 'slug'>[] | null }

  // Build events query
  let query = supabase
    .from('events')
    .select('*, ticket_tiers(price, currency), category:event_categories(name, slug)', { count: 'exact' })
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

  const now = new Date().toISOString()
  if (params.date === 'today') {
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    query = query.gte('start_date', now).lte('start_date', endOfDay.toISOString())
  } else if (params.date === 'week') {
    const endOfWeek = new Date()
    endOfWeek.setDate(endOfWeek.getDate() + 7)
    query = query.gte('start_date', now).lte('start_date', endOfWeek.toISOString())
  } else if (params.date === 'month') {
    const endOfMonth = new Date()
    endOfMonth.setDate(endOfMonth.getDate() + 30)
    query = query.gte('start_date', now).lte('start_date', endOfMonth.toISOString())
  } else {
    query = query.gte('start_date', now)
  }

  const { data: events, count } = await query as {
    data: (Event & {
      ticket_tiers: { price: number; currency: string }[]
      category: { name: string; slug: string } | null
    })[] | null
    count: number | null
  }

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-xl font-bold text-blue-600">EVENTLINQS</Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Discover Events</h1>

          {/* Search */}
          <form method="GET" className="mt-4">
            <div className="flex gap-2">
              <input
                name="q"
                defaultValue={params.q}
                type="search"
                placeholder="Search events…"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {params.category && <input type="hidden" name="category" value={params.category} />}
              {params.city && <input type="hidden" name="city" value={params.city} />}
              {params.date && <input type="hidden" name="date" value={params.date} />}
              {params.free && <input type="hidden" name="free" value={params.free} />}
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Sidebar filters */}
          <aside className="w-full lg:w-60 shrink-0">
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
              {/* Date filter */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">When</p>
                <div className="space-y-1">
                  {[
                    { key: undefined, label: 'Any time' },
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: 'This week' },
                    { key: 'month', label: 'This month' },
                  ].map(opt => (
                    <Link
                      key={opt.label}
                      href={buildUrl({ date: opt.key, page: '1' })}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        (params.date ?? undefined) === opt.key
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Category filter */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Category</p>
                <div className="space-y-1">
                  <Link
                    href={buildUrl({ category: undefined, page: '1' })}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      !params.category ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    All categories
                  </Link>
                  {(categories ?? []).map(c => (
                    <Link
                      key={c.id}
                      href={buildUrl({ category: c.id, page: '1' })}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        params.category === c.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Free toggle */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Price</p>
                <Link
                  href={buildUrl({ free: params.free === '1' ? undefined : '1', page: '1' })}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    params.free === '1' ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {params.free === '1' ? '✓ ' : ''}Free events only
                </Link>
              </div>
            </div>
          </aside>

          {/* Event grid */}
          <div className="flex-1">
            <p className="mb-4 text-sm text-gray-500">
              {count ?? 0} event{(count ?? 0) !== 1 ? 's' : ''} found
            </p>

            {!events || events.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
                <p className="text-sm text-gray-500">No events found matching your filters.</p>
                <Link
                  href="/events"
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  Clear filters
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {events.map(event => (
                  <Link
                    key={event.id}
                    href={`/events/${event.slug}`}
                    className="group flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {/* Cover image */}
                    <div className="relative aspect-video bg-gray-100">
                      {event.cover_image_url ? (
                        <Image
                          src={event.cover_image_url}
                          alt={event.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {event.category && (
                        <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                          {event.category.name}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-xs text-blue-600 font-medium">{formatDate(event.start_date)}</p>
                      <h3 className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {event.title}
                      </h3>
                      {event.venue_city && (
                        <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {event.venue_city}
                        </p>
                      )}
                      <p className="mt-auto pt-3 text-sm font-semibold text-gray-900">
                        {formatPrice(event.ticket_tiers)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {page > 1 && (
                  <Link
                    href={buildUrl({ page: String(page - 1) })}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                {page < totalPages && (
                  <Link
                    href={buildUrl({ page: String(page + 1) })}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
