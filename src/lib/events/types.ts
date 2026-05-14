/**
 * Shared types for the M5 /events browse data layer.
 *
 * Row shape returned by fetchPublicEvents / fetchRecommendedEvents /
 * fetchPopularThisWeek. Aligns with the columns selected in the underlying
 * Supabase query + computed fields (dynamic price, social-proof badge).
 */

export type SocialProofBadge =
  | 'last_chance'
  | 'few_left'
  | 'selling_fast'
  | 'just_announced'
  | 'free'

export type PublicEventTier = {
  id: string
  price: number
  currency: string
  sold_count: number
  reserved_count: number
  total_capacity: number
}

export type PublicEventRow = {
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
  category: { id: string; name: string; slug: string } | null
  organisation: { id: string; name: string; slug: string } | null
  ticket_tiers: PublicEventTier[]
  badge: SocialProofBadge | null
}

export type FetchPublicEventsFilters = {
  q?: string
  preset?: 'all' | 'today' | 'tomorrow' | 'weekend' | '7d' | 'month' | 'free'
  category?: string
  /**
   * Culture filter (one of CultureSlug). Resolved against the
   * culture -> legacy-category bridge until the culture_primary column
   * lands in production.
   */
  culture?: string
  /**
   * Sub-culture slug (e.g. amapiano, owambe, garba-raas). When the slug
   * matches a legacy category-slug it narrows further; otherwise it
   * falls through and only the culture filter applies.
   */
  sub_culture?: string
  price_min?: number
  price_max?: number
  from?: string
  to?: string
  distance_km?: number
  sort?: 'relevance' | 'date_asc' | 'price_asc' | 'popularity'
  city?: string
  country?: string
}

export type BboxFilter = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export type GeoOrigin = {
  latitude: number
  longitude: number
}

export type FetchPublicEventsInput = {
  filters?: FetchPublicEventsFilters
  page?: number
  pageSize?: number
  bbox?: BboxFilter
  origin?: GeoOrigin
}

export type FetchPublicEventsResult = {
  events: PublicEventRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
