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
   * Community filter (one of CommunitySlug). Resolved against the
   * community -> legacy-category bridge until the community_primary column
   * lands in production.
   */
  community?: string
  /**
   * Sub-community slug (e.g. amapiano, owambe, garba-raas). When the slug
   * matches a legacy category-slug it narrows further; otherwise it
   * falls through and only the community filter applies.
   */
  sub_community?: string
  price_min?: number
  price_max?: number
  from?: string
  to?: string
  distance_km?: number
  sort?: 'relevance' | 'date_asc' | 'price_asc' | 'popularity'
  city?: string
  country?: string
  /**
   * City-facing suburb slug from /city/[slug]/[suburb] ("inner-melbourne").
   * Resolved to a district centroid and applied as a radius, because these are
   * broad districts with no text form that matches any venue column. See
   * lib/events/url-filters.ts.
   */
  suburb?: string
  /**
   * One of the eight city-page format tiles (concert, dj-set, comedy, theatre,
   * workshop, community, food-drink, sport). There is no event_type column, so
   * each resolves to real tags plus the category carrying the same meaning.
   *
   * main described the same field as CITY_EVENT_TYPES resolving through
   * EVENT_TYPE_FILTER. Same field, same type, same intent, so one definition
   * is kept rather than two descriptions of one thing.
   */
  event_type?: string
  /**
   * Venue handle or venue name; both resolve to a venue_name match. Emitted by
   * the "see everything at this venue" link on a venue profile, which
   * previously landed on the unfiltered national list.
   */
  venue?: string
  /** Organisation slug, from the organiser profile "View all". */
  organiser?: string
  /** Faith slug, reusing the tag bridge the /faith landing selects on. */
  faith?: string
  /** Community-moment slug; contributes a heritage and a date window. */
  moment?: string
  /**
   * Which entity the header search was scoped to. Narrows where the query is
   * allowed to match; without it all four search tabs behaved identically.
   *
   * MERGE NOTE, resolution 1 of the nine in
   * docs/roast/HANDOVER-public-composer-2026-08-09.md section 2: UNION. main
   * added `tab`, this line of work added suburb, organiser, faith and moment.
   * Dropping either side loses a shipped filter, so both sides are here.
   */
  tab?: 'events' | 'cities' | 'communities' | 'organisers'
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
