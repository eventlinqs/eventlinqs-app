import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBadge } from './badges'
import type {
  FetchPublicEventsInput,
  FetchPublicEventsResult,
  PublicEventRow,
} from './types'

/**
 * Raw row shape as it comes back from the Supabase query.
 * Nested selects return single-item arrays or objects depending on FK type;
 * we normalise both in toPublicEventRow.
 */
type RawRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  start_date: string
  end_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  created_at: string
  is_free: boolean | null
  category: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null
  organisation: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null
  ticket_tiers: {
    id: string
    price: number
    currency: string
    sold_count: number
    reserved_count: number
    total_capacity: number
  }[] | null
}

const DEFAULT_PAGE_SIZE = 24
const BASE_SELECT =
  'id, slug, title, summary, description, cover_image_url, thumbnail_url, gallery_urls, start_date, end_date, venue_name, venue_city, venue_country, venue_latitude, venue_longitude, created_at, is_free, category:event_categories(id, name, slug), organisation:organisations(id, name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

function normaliseRelation<T>(rel: T | T[] | null): T | null {
  if (rel === null || rel === undefined) return null
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel
}

function toPublicEventRow(raw: RawRow): PublicEventRow {
  const row = {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    summary: raw.summary,
    description: raw.description,
    cover_image_url: raw.cover_image_url,
    thumbnail_url: raw.thumbnail_url,
    gallery_urls: raw.gallery_urls,
    start_date: raw.start_date,
    end_date: raw.end_date,
    venue_name: raw.venue_name,
    venue_city: raw.venue_city,
    venue_country: raw.venue_country,
    venue_latitude: raw.venue_latitude,
    venue_longitude: raw.venue_longitude,
    created_at: raw.created_at,
    is_free: raw.is_free,
    category: normaliseRelation(raw.category),
    organisation: normaliseRelation(raw.organisation),
    ticket_tiers: raw.ticket_tiers ?? [],
  }
  return withBadge(row)
}

function presetWindow(preset: string | undefined, now: Date): { from: string; to?: string } | null {
  if (!preset || preset === 'all' || preset === 'free') return null

  const nowIso = now.toISOString()

  if (preset === 'today') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { from: nowIso, to: end.toISOString() }
  }

  if (preset === 'tomorrow') {
    const start = new Date(now)
    start.setDate(start.getDate() + 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }

  if (preset === 'weekend') {
    const day = now.getDay() // 0 Sun .. 6 Sat
    const start = new Date(now)
    if (day === 6) {
      start.setHours(0, 0, 0, 0)
    } else if (day === 0) {
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
    } else {
      start.setDate(start.getDate() + (6 - day))
      start.setHours(0, 0, 0, 0)
    }
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }

  if (preset === '7d') {
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return { from: nowIso, to: end.toISOString() }
  }

  if (preset === 'month') {
    const end = new Date(now)
    end.setMonth(end.getMonth() + 1)
    return { from: nowIso, to: end.toISOString() }
  }

  return null
}

/**
 * Fetch published public events with filter + pagination + optional bbox.
 * Uses the cookies-free public client so callers (including dynamic
 * /events filter renders) don't get tainted into per-request SSR by a
 * cookies() read. RLS permits SELECT on published + public events for
 * anonymous visitors via the anon key.
 */
export async function fetchPublicEvents(
  input: FetchPublicEventsInput = {},
): Promise<FetchPublicEventsResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const offset = (page - 1) * pageSize
  const filters = input.filters ?? {}
  const now = new Date()

  const supabase = createPublicClient()

  // Distance filter: resolve IDs within radius via Haversine RPC before
  // the main query. Requires an origin; silently no-ops if the caller
  // didn't provide one (geolocation not granted / unresolved).
  let distanceIds: string[] | null = null
  if (
    typeof filters.distance_km === 'number' &&
    filters.distance_km > 0 &&
    input.origin
  ) {
    const { data: nearby } = await supabase.rpc('events_within_distance', {
      p_lat: input.origin.latitude,
      p_lng: input.origin.longitude,
      p_radius_km: filters.distance_km,
    })
    distanceIds = ((nearby ?? []) as { id: string }[]).map(e => e.id)
    if (distanceIds.length === 0) {
      return { events: [], total: 0, page, pageSize, totalPages: 0 }
    }
  }

  let query = supabase
    .from('events')
    .select(BASE_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('visibility', 'public')
    .range(offset, offset + pageSize - 1)

  if (distanceIds) query = query.in('id', distanceIds)

  if (filters.sort === 'date_asc' || !filters.sort || filters.sort === 'relevance') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'price_asc') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'popularity') {
    query = query.order('start_date', { ascending: true })
  }

  if (filters.q) {
    query = query.ilike('title', `%${filters.q}%`)
  }
  if (filters.category) {
    const { data: cat } = await supabase
      .from('event_categories')
      .select('id')
      .eq('slug', filters.category)
      .maybeSingle()
    if (cat) {
      query = query.eq('category_id', cat.id)
    } else {
      query = query.eq('category_id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (filters.city) {
    query = query.ilike('venue_city', `%${filters.city}%`)
  }
  if (filters.country) {
    query = query.eq('venue_country', filters.country)
  }

  if (filters.preset === 'free') {
    query = query.eq('is_free', true)
  }

  const window = presetWindow(filters.preset, now)
  if (window) {
    query = query.gte('start_date', window.from)
    if (window.to) query = query.lte('start_date', window.to)
  } else {
    query = query.gte('start_date', now.toISOString())
  }

  if (filters.from) query = query.gte('start_date', filters.from)
  if (filters.to) query = query.lte('start_date', filters.to)

  if (input.bbox) {
    query = query
      .gte('venue_longitude', input.bbox.minLng)
      .lte('venue_longitude', input.bbox.maxLng)
      .gte('venue_latitude', input.bbox.minLat)
      .lte('venue_latitude', input.bbox.maxLat)
  }

  const { data, count, error } = await query
  if (error) {
    console.error('[fetchPublicEvents] query failed:', error)
    return { events: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const raw = (data ?? []) as unknown as RawRow[]
  let events = raw.map(toPublicEventRow)

  // price_min / price_max arrive in AUD (dollar units) from the URL; tier
  // prices are stored as integer minor units (cents) per the monetary
  // conventions in CLAUDE.md. Convert before comparison.
  const priceFiltered =
    typeof filters.price_min === 'number' || typeof filters.price_max === 'number'
  if (priceFiltered) {
    const minCents = (filters.price_min ?? 0) * 100
    const maxCents =
      filters.price_max === undefined ? Number.POSITIVE_INFINITY : filters.price_max * 100
    events = events.filter(e => {
      if (e.ticket_tiers.length === 0) return minCents === 0
      const cheapest = Math.min(...e.ticket_tiers.map(t => t.price))
      return cheapest >= minCents && cheapest <= maxCents
    })
  }

  if (filters.sort === 'price_asc') {
    events.sort((a, b) => cheapest(a) - cheapest(b))
  }

  // When price filtering strips rows post-query, the Supabase `count`
  // reflects the pre-filter total and disagrees with the rendered grid.
  // Use the filtered length as the source of truth so the hero strip
  // and pagination match what the user sees.
  // TODO(m5-perf): move price filter into SQL to avoid over-fetching
  //   when query pages are large - tracked against Step 8.
  const total = priceFiltered ? events.length : count ?? events.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { events, total, page, pageSize, totalPages }
}

function cheapest(e: PublicEventRow): number {
  if (e.ticket_tiers.length === 0) return 0
  return Math.min(...e.ticket_tiers.map(t => t.price))
}

/**
 * Cached variant for anonymous default-case browsing. Uses the admin client
 * (published + public filter keeps data scope identical to RLS) and
 * unstable_cache so PSI/bot cache-bust queries still share a warm snapshot.
 * Bucketed by hour to avoid cache-key explosion while staying fresh.
 * Callers must only pass origin when genuinely needed - ignore the argument
 * for the default case so the cache key stays stable.
 */
export async function fetchPublicEventsCached(
  input: FetchPublicEventsInput = {},
): Promise<FetchPublicEventsResult> {
  const filters = input.filters ?? {}
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const keyParts = [
    'events-public-v1',
    `bucket:${bucket}`,
    `page:${page}`,
    `size:${pageSize}`,
    `country:${filters.country ?? ''}`,
    `city:${filters.city ?? ''}`,
    `category:${filters.category ?? ''}`,
    `preset:${filters.preset ?? ''}`,
    `sort:${filters.sort ?? ''}`,
    `q:${filters.q ?? ''}`,
    `from:${filters.from ?? ''}`,
    `to:${filters.to ?? ''}`,
    `pmin:${filters.price_min ?? ''}`,
    `pmax:${filters.price_max ?? ''}`,
  ]
  const cacheKey = keyParts.join('|')

  return unstable_cache(
    () => runFetchPublicEventsAdmin({ filters, page, pageSize, origin: input.origin, bbox: input.bbox }),
    [cacheKey],
    { revalidate: 60, tags: ['events-public'] },
  )()
}

export const fetchActiveCategoriesCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('event_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order')
    return (data ?? []) as { id: string; name: string; slug: string }[]
  },
  ['events-active-categories-v1'],
  { revalidate: 3600, tags: ['event-categories'] },
)

async function runFetchPublicEventsAdmin(
  input: FetchPublicEventsInput,
): Promise<FetchPublicEventsResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const offset = (page - 1) * pageSize
  const filters = input.filters ?? {}
  const now = new Date()

  const supabase = createAdminClient()

  let query = supabase
    .from('events')
    .select(BASE_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('visibility', 'public')
    .range(offset, offset + pageSize - 1)

  if (filters.sort === 'date_asc' || !filters.sort || filters.sort === 'relevance') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'price_asc') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'popularity') {
    query = query.order('start_date', { ascending: true })
  }

  if (filters.q) query = query.ilike('title', `%${filters.q}%`)
  if (filters.category) {
    const { data: cat } = await supabase
      .from('event_categories')
      .select('id')
      .eq('slug', filters.category)
      .maybeSingle()
    if (cat) {
      query = query.eq('category_id', cat.id)
    } else {
      query = query.eq('category_id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (filters.city) query = query.ilike('venue_city', `%${filters.city}%`)
  if (filters.country) query = query.eq('venue_country', filters.country)
  if (filters.preset === 'free') query = query.eq('is_free', true)

  const window = presetWindow(filters.preset, now)
  if (window) {
    query = query.gte('start_date', window.from)
    if (window.to) query = query.lte('start_date', window.to)
  } else {
    query = query.gte('start_date', now.toISOString())
  }

  if (filters.from) query = query.gte('start_date', filters.from)
  if (filters.to) query = query.lte('start_date', filters.to)

  const { data, count, error } = await query
  if (error) {
    console.error('[fetchPublicEventsCached] query failed:', error)
    return { events: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const raw = (data ?? []) as unknown as RawRow[]
  let events = raw.map(toPublicEventRow)

  const priceFiltered =
    typeof filters.price_min === 'number' || typeof filters.price_max === 'number'
  if (priceFiltered) {
    const minCents = (filters.price_min ?? 0) * 100
    const maxCents =
      filters.price_max === undefined ? Number.POSITIVE_INFINITY : filters.price_max * 100
    events = events.filter(e => {
      if (e.ticket_tiers.length === 0) return minCents === 0
      const cheap = Math.min(...e.ticket_tiers.map(t => t.price))
      return cheap >= minCents && cheap <= maxCents
    })
  }

  if (filters.sort === 'price_asc') {
    events.sort((a, b) => cheapest(a) - cheapest(b))
  }

  const total = priceFiltered ? events.length : count ?? events.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { events, total, page, pageSize, totalPages }
}

/**
 * Popular-this-week: events with the most orders confirmed in the last 7
 * days. Falls back to upcoming-by-date if the DB hasn't accrued enough order
 * signal yet. When `city` is supplied the result is narrowed to events in
 * that city (ilike match so "Melbourne" matches "Melbourne, VIC").
 */
export async function fetchPopularThisWeek(
  limit: number = 12,
  city?: string,
): Promise<PublicEventRow[]> {
  const supabase = await createClient()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: popular, error: popularError } = await supabase
    .from('orders')
    .select('event_id')
    .gte('created_at', weekAgo.toISOString())
    .eq('status', 'confirmed')

  if (popularError) {
    console.error('[fetchPopularThisWeek] order scan failed:', popularError)
  }

  const counts = new Map<string, number>()
  for (const row of (popular ?? []) as { event_id: string }[]) {
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1)
  }

  const sortedIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  if (sortedIds.length === 0) {
    const { events } = await fetchPublicEvents({
      page: 1,
      pageSize: limit,
      filters: city ? { city } : undefined,
    })
    return events
  }

  const now = new Date().toISOString()
  let query = supabase
    .from('events')
    .select(BASE_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', now)
    .in('id', sortedIds)
  if (city) query = query.ilike('venue_city', `%${city}%`)

  const { data, error } = await query

  if (error) {
    console.error('[fetchPopularThisWeek] event hydrate failed:', error)
    return []
  }

  const raw = (data ?? []) as unknown as RawRow[]
  const byId = new Map(raw.map(r => [r.id, r]))
  return sortedIds
    .map(id => byId.get(id))
    .filter((r): r is RawRow => Boolean(r))
    .map(toPublicEventRow)
}

/**
 * Recommended-for-you: union of events from organisers the user has saved,
 * categories the user has saved, and events in the user's preferred city.
 * Deduplicated by event id. Falls back to fetchPopularThisWeek when there
 * are no personalisation signals (anonymous user or empty profile).
 */
export async function fetchRecommendedEvents(
  userId: string | null,
  limit: number = 12,
  city?: string,
): Promise<PublicEventRow[]> {
  if (!userId) return fetchPopularThisWeek(limit, city)

  const supabase = await createClient()

  const [savedOrgsRes, savedCatsRes, profileRes] = await Promise.all([
    supabase.from('saved_organisers').select('organisation_id').eq('user_id', userId),
    supabase.from('saved_categories').select('category_id').eq('user_id', userId),
    supabase.from('profiles').select('preferred_city').eq('id', userId).maybeSingle(),
  ])

  const orgIds = (savedOrgsRes.data ?? []).map(r => r.organisation_id as string)
  const catIds = (savedCatsRes.data ?? []).map(r => r.category_id as string)
  const preferredCity =
    profileRes.data?.preferred_city && typeof profileRes.data.preferred_city === 'object'
      ? (profileRes.data.preferred_city as { city?: string }).city ?? null
      : null

  if (orgIds.length === 0 && catIds.length === 0 && !preferredCity) {
    return fetchPopularThisWeek(limit, city)
  }

  const now = new Date().toISOString()
  const orFilters: string[] = []
  if (orgIds.length > 0) orFilters.push(`organisation_id.in.(${orgIds.join(',')})`)
  if (catIds.length > 0) orFilters.push(`category_id.in.(${catIds.join(',')})`)
  if (preferredCity) orFilters.push(`venue_city.ilike.%${preferredCity}%`)

  let query = supabase
    .from('events')
    .select(BASE_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(limit)

  if (orFilters.length > 0) query = query.or(orFilters.join(','))
  // Route-level city constraint wins over preferred_city - when the user
  // lands on /events/browse/{slug} the rail must not bleed events from
  // other cities into a city-scoped page.
  if (city) query = query.ilike('venue_city', `%${city}%`)

  const { data, error } = await query
  if (error) {
    console.error('[fetchRecommendedEvents] query failed:', error)
    return fetchPopularThisWeek(limit, city)
  }

  const raw = (data ?? []) as unknown as RawRow[]
  const events = raw.map(toPublicEventRow)
  if (events.length === 0) return fetchPopularThisWeek(limit, city)
  return events
}
