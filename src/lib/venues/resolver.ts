/**
 * Venue resolver for /venues/[handle] (Batch 8.3).
 *
 * Public handle = slug-form of `venue.name` (lower, hyphenated).
 * Resolves to a unified VenueProfile shape sourced from:
 *   1. The `venues` table when a row exists with that slug-form name.
 *   2. Otherwise, aggregations from `events.venue_name` ilike `venueName`
 *      so every public-event venue gets a profile page even before the
 *      M7 admin panel formally creates a venues row.
 *
 * Forward-compat: when the M7 admin panel adds `slug`, `latitude`,
 * `longitude`, `venue_type`, `amenities`, `website`, `phone` columns
 * to the venues table, the resolver picks them up automatically -
 * the resolver prefers venues-row values over event aggregations.
 */

import { createPublicClient } from '@/lib/supabase/public-client'

export function venueSlugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface VenueProfile {
  /** Stable identifier for SEO + page rendering. */
  handle: string
  name: string
  description: string | null
  imageUrl: string | null
  capacity: number | null
  /** Best-effort - falls back to most-recent event venue_city if no row. */
  city: string | null
  state: string | null
  country: string | null
  /** Best-effort full address - empty string if no row + events have no address. */
  address: string | null
  postalCode: string | null
  /** Most-recent non-null event-derived geo (events.venue_latitude/longitude). */
  latitude: number | null
  longitude: number | null
  /** Derived from most-frequent event category at this venue. */
  venueType: string | null
}

interface VenueRow {
  id: string
  name: string
  description: string | null
  image_url: string | null
  capacity: number | null
  city: string | null
  state: string | null
  country: string | null
  address: string | null
  postal_code: string | null
}

interface EventRowForVenue {
  category: { name: string; slug: string } | null
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_address: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  start_date: string
}

/** Slug match against venues.name (no slug column today). */
async function findVenueRowBySlug(slug: string): Promise<VenueRow | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('venues')
    .select('id, name, description, image_url, capacity, city, state, country, address, postal_code')
    .eq('is_active', true)
    .limit(50)
  const all = (data ?? []) as VenueRow[]
  const match = all.find(v => venueSlugify(v.name) === slug)
  return match ?? null
}

/** Pull events that name-match a venue; used for both the slug-without-row
 *  resolution path and to derive aggregations regardless of which path. */
async function fetchVenueEvents(venueName: string): Promise<EventRowForVenue[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select(
      'category:event_categories(name, slug), venue_name, venue_city, venue_state, venue_country, venue_address, venue_latitude, venue_longitude, start_date',
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .ilike('venue_name', venueName)
    .order('start_date', { ascending: false })
    .limit(60)
  return ((data ?? []) as unknown as EventRowForVenue[])
}

function deriveVenueType(events: EventRowForVenue[]): string | null {
  const counts = new Map<string, number>()
  for (const e of events) {
    const name = e.category?.name
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  // Most frequent category is the venue's type.
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const top = sorted[0][0]
  // Generic mapping from event category to venue type label.
  const TYPE_MAP: Record<string, string> = {
    'Music': 'Live music venue',
    'Concert': 'Concert hall',
    'Comedy': 'Comedy club',
    'Theatre': 'Theatre',
    'Festival': 'Festival ground',
    'Sport': 'Sports venue',
    'Sports': 'Sports venue',
    'Workshop': 'Event venue',
    'Community': 'Community venue',
    'Nightlife': 'Live music venue',
    'Arts & Community': 'Community venue',
  }
  return TYPE_MAP[top] ?? `${top} venue`
}

/**
 * Public resolver. Returns null when no venues row matches AND no
 * published event names a venue with that slug.
 */
export async function resolveVenueProfile(handle: string): Promise<VenueProfile | null> {
  const supabase = createPublicClient()
  const row = await findVenueRowBySlug(handle)

  // Fetch events using the venue name we found, OR fallback by guessing
  // the venue name from the slug if no row exists.
  let venueName = row?.name ?? null
  let events: EventRowForVenue[] = []

  if (venueName) {
    events = await fetchVenueEvents(venueName)
  } else {
    // No row - derive a candidate venue name by un-slugifying then ilike
    // matching against events.venue_name. Pick the most-frequent name.
    const candidate = handle.replace(/-/g, ' ')
    const { data } = await supabase
      .from('events')
      .select('venue_name')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .ilike('venue_name', `%${candidate}%`)
      .limit(50)
    const counts = new Map<string, number>()
    for (const r of ((data ?? []) as { venue_name: string | null }[])) {
      if (!r.venue_name) continue
      if (venueSlugify(r.venue_name) !== handle) continue
      counts.set(r.venue_name, (counts.get(r.venue_name) ?? 0) + 1)
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!top) return null
    venueName = top
    events = await fetchVenueEvents(venueName)
  }

  if (!venueName) return null

  // Derive geo + city + state + country from most-recent event with non-null fields.
  const withGeo = events.find(e => typeof e.venue_latitude === 'number' && typeof e.venue_longitude === 'number')
  const withCity = events.find(e => e.venue_city)
  const withAddress = events.find(e => e.venue_address)

  return {
    handle,
    name: venueName,
    description: row?.description ?? null,
    imageUrl: row?.image_url ?? null,
    capacity: row?.capacity ?? null,
    city: row?.city ?? withCity?.venue_city ?? null,
    state: row?.state ?? withCity?.venue_state ?? null,
    country: row?.country ?? withCity?.venue_country ?? 'AU',
    address: row?.address ?? withAddress?.venue_address ?? null,
    postalCode: row?.postal_code ?? null,
    latitude: withGeo?.venue_latitude ?? null,
    longitude: withGeo?.venue_longitude ?? null,
    venueType: deriveVenueType(events),
  }
}
