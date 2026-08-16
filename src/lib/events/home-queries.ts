import type { SupabaseClient } from '@supabase/supabase-js'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import type {
  FeaturedHeroEvent,
} from '@/components/features/events/featured-event-hero'
import { fixtureEnabled, loadFixtureRows } from '@/lib/dev/fixture-events'
import { isStillListed, listingWindowOrPredicate } from '@/lib/events/listing-window'

export const EVENT_SELECT =
  // `timezone` is selected because every card that prints a date must format it
  // in the EVENT's zone. Without it the homepage formats in the runtime zone,
  // which is UTC on the server and the reader's in the browser, so a Perth
  // event at 9pm shows the wrong DAY to someone in Sydney.
  'id, slug, title, summary, cover_image_url, thumbnail_url, gallery_urls, start_date, timezone, venue_name, venue_city, venue_state, venue_country, is_free, created_at, category:event_categories(name, slug), organisation:organisations(name), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

export type RawRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  start_date: string
  /** The EVENT's IANA zone. Every rail date is formatted in it, never the reader's. */
  timezone: string | null
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  is_free: boolean | null
  created_at: string
  category: { name: string; slug: string } | null
  organisation: { name: string } | null
  ticket_tiers: { id: string; price: number; currency: string; sold_count: number; reserved_count: number; total_capacity: number }[] | null
}

export function toBentoEvent(r: RawRow): BentoEvent {
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
    timezone: r.timezone,
    venue_name: r.venue_name,
    venue_city: r.venue_city,
    is_free: r.is_free,
    category: r.category,
    ticket_tiers: tiers.map(t => ({ price: t.price, currency: t.currency })),
    percent_sold,
  }
}

export function toFeaturedHeroEvent(r: RawRow): FeaturedHeroEvent {
  return {
    ...toBentoEvent(r),
    organisation: r.organisation,
  }
}

/**
 * Loads the upcoming-events list the homepage leads with.
 *
 * Normal path (prod, preview, every deployed environment): queries Supabase
 * for published, public, future events ordered by start date.
 *
 * Density path (HOMEPAGE_SEED_FIXTURE=1, Preview + local only): returns the
 * local general-breadth catalogue fixture (the 55-event catalogue) produced by
 * `scripts/seed-events-catalogue.mjs --fixture`. On Vercel the prebuild step
 * regenerates that fixture at build time when the flag is set and the file is
 * traced into the serverless bundle (next.config outputFileTracingIncludes), so
 * PREVIEW deployments render the full catalogue at Ticketmaster-rival density
 * while staging is not yet up. The fixture is read at runtime via fs (never
 * statically imported), so its absence is a no-op.
 *
 * HARD GUARD: the flag is honoured only when VERCEL_ENV is not 'production'.
 * Even if HOMEPAGE_SEED_FIXTURE were ever set on a Production deployment, the
 * homepage would still serve real data, never the fixture. The flag is a
 * Preview-only Vercel env var (see .env.example).
 */
export async function loadHomeUpcoming(
  supabase: SupabaseClient,
  nowIso: string,
  limit = 24,
): Promise<RawRow[]> {
  if (fixtureEnabled()) {
    const rows = await loadFixtureRows()
    /*
     * FALL THROUGH WHEN THE FIXTURE YIELDS NOTHING USABLE, not merely when the
     * FILE is missing.
     *
     * This used to test `rows.length > 0` and then return the filtered list. A
     * fixture that existed but had aged entirely into the past therefore
     * returned an EMPTY array and never reached the live query below, and the
     * homepage rendered its designed empty state over a database holding 184
     * upcoming events. That is exactly what happened: the generator anchored its
     * dates to a hardcoded 7 June 2026, so by mid-August every fixture row was
     * in the past, and the deployed preview homepage showed no events at all
     * while /events showed a full catalogue.
     *
     * Nothing failed, because "the fixture is stale" and "there are no events"
     * produce the identical screen. The generator is fixed to anchor on today,
     * and this fall-through makes a stale fixture harmless rather than silent:
     * the worst case is now real data instead of a blank page.
     */
    const usable = rows
      // Listed until it has ENDED, not until it has started. The fixture path
      // gets the same rule as the live query below, or the homepage would
      // disagree with /events about what is on today.
      .filter(r => isStillListed(r, new Date(nowIso)))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    if (usable.length > 0) return usable
  }
  const { data } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    // LISTED UNTIL IT HAS ENDED. This was `start_date >= now`, which took an
    // event off the homepage the moment it began. src/lib/events/listing-window.ts
    // carries the rule and the reason.
    .or(listingWindowOrPredicate(new Date(nowIso)))
    /*
     * EXTERNALLY TICKETED EVENTS ARE NOT IN THE RAILS. Founder ruling
     * 15 August 2026, non-negotiable 4.
     *
     * The homepage rails are the platform's scarcest surface and they exist to
     * sell tickets. An event whose ticketing lives somewhere else cannot convert
     * there, so giving it a rail slot would spend our best real estate driving
     * traffic off the platform, ahead of an organiser who did move their
     * ticketing here. Its own event page stays live and indexable, because that
     * page serves the artist and is the entire point of the feature.
     *
     * The partial index idx_events_internal_ticketing is exactly this shape.
     */
    .is('external_ticket_url', null)
    .order('start_date', { ascending: true })
    .limit(limit)
  return (data ?? []) as unknown as RawRow[]
}

export const COMMUNITY_TABS: { slug: string; label: string; tag: string; href: string }[] = [
  { slug: 'afrobeats',   label: 'Afrobeats',  tag: 'afrobeats',   href: '/categories/afrobeats' },
  { slug: 'amapiano',    label: 'Amapiano',   tag: 'amapiano',    href: '/categories/amapiano' },
  { slug: 'owambe',      label: 'Owambe',     tag: 'owambe',      href: '/categories/owambe' },
  { slug: 'caribbean',   label: 'Caribbean',  tag: 'caribbean',   href: '/categories/caribbean' },
  { slug: 'heritage',    label: 'Heritage',   tag: 'heritage',    href: '/categories/heritage-and-independence' },
  { slug: 'networking',  label: 'Business',   tag: 'business',    href: '/categories/networking' },
]

// Australia-only (Law 3, national-from-day-one). The homepage By-City rail
// covers every launch city the image spine supports; foreign cities are not
// listed on an Australia-only platform. Order is the founder's display order;
// the rail filters to cities with at least one upcoming event (city-rail-section).
export const CITY_TILES = [
  { city: 'Melbourne',    slug: 'melbourne' },
  { city: 'Sydney',       slug: 'sydney' },
  { city: 'Brisbane',     slug: 'brisbane' },
  { city: 'Perth',        slug: 'perth' },
  { city: 'Adelaide',     slug: 'adelaide' },
  { city: 'Gold Coast',   slug: 'gold-coast' },
  { city: 'Canberra',     slug: 'canberra' },
  { city: 'Newcastle',    slug: 'newcastle' },
  { city: 'Hobart',       slug: 'hobart' },
  { city: 'Darwin',       slug: 'darwin' },
  { city: 'Wollongong',   slug: 'wollongong' },
  { city: 'Geelong',      slug: 'geelong' },
  { city: 'Cairns',       slug: 'cairns' },
]

// Cities that have a real local SVG silhouette in public/cities/. This MUST
// match the files actually present there: a slug listed here without a
// corresponding public/cities/<slug>.svg renders /cities/<slug>.svg and 404s.
// Everything not in this set falls back to public/cities/_fallback.svg (which
// always exists), and a real Pexels/stock photo is preferred over both. Keep
// this set in sync when city SVGs are added or removed.
export const LOCAL_CITY_SVG = new Set(['melbourne', 'sydney'])

export const FALLBACK_SEEDS = [
  { id: 'f1', href: '/events/browse/melbourne', title: 'Afrobeats scene in Melbourne', community: 'Melbourne, VIC',   categorySlug: 'afrobeats' },
  { id: 'f2', href: '/events/browse/sydney',    title: 'Community events in Sydney',   community: 'Sydney, NSW',      categorySlug: 'community' },
  { id: 'f3', href: '/events/browse/brisbane',  title: 'Gospel nights Brisbane',       community: 'Brisbane, QLD',    categorySlug: 'gospel' },
  { id: 'f4', href: '/events/browse/geelong',   title: 'Geelong community scene',      community: 'Geelong, VIC',     categorySlug: 'community' },
  { id: 'f5', href: '/events/browse/perth',     title: 'Community events Perth',       community: 'Perth, WA',        categorySlug: 'heritage-and-independence' },
  { id: 'f6', href: '/events',                  title: 'Regional Australia events',    community: 'Across Australia', categorySlug: 'festival' },
] as const
