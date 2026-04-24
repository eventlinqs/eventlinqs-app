import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import type {
  FeaturedHeroEvent,
} from '@/components/features/events/featured-event-hero'

export const EVENT_SELECT =
  'id, slug, title, summary, cover_image_url, thumbnail_url, gallery_urls, start_date, venue_name, venue_city, venue_state, venue_country, is_free, created_at, category:event_categories(name, slug), organisation:organisations(name), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

export type RawRow = {
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

export const CULTURE_TABS: { slug: string; label: string; tag: string; href: string }[] = [
  { slug: 'afrobeats',   label: 'Afrobeats',  tag: 'afrobeats',   href: '/categories/afrobeats' },
  { slug: 'amapiano',    label: 'Amapiano',   tag: 'amapiano',    href: '/categories/amapiano' },
  { slug: 'owambe',      label: 'Owambe',     tag: 'owambe',      href: '/categories/owambe' },
  { slug: 'caribbean',   label: 'Caribbean',  tag: 'caribbean',   href: '/categories/caribbean' },
  { slug: 'heritage',    label: 'Heritage',   tag: 'heritage',    href: '/categories/heritage-and-independence' },
  { slug: 'networking',  label: 'Business',   tag: 'business',    href: '/categories/networking' },
]

export const CITY_TILES = [
  { city: 'Melbourne',    slug: 'melbourne' },
  { city: 'Sydney',       slug: 'sydney' },
  { city: 'Brisbane',     slug: 'brisbane' },
  { city: 'Perth',        slug: 'perth' },
  { city: 'Adelaide',     slug: 'adelaide' },
  { city: 'Gold Coast',   slug: 'gold-coast' },
  { city: 'Geelong',      slug: 'geelong' },
  { city: 'Hobart',       slug: 'hobart' },
  { city: 'Canberra',     slug: 'canberra' },
  { city: 'Darwin',       slug: 'darwin' },
  { city: 'Newcastle',    slug: 'newcastle' },
  { city: 'Wollongong',   slug: 'wollongong' },
  { city: 'Auckland',     slug: 'auckland' },
  { city: 'London',       slug: 'london' },
  { city: 'Manchester',   slug: 'manchester' },
  { city: 'Dublin',       slug: 'dublin' },
  { city: 'Toronto',      slug: 'toronto' },
  { city: 'New York',     slug: 'new-york' },
  { city: 'Houston',      slug: 'houston' },
  { city: 'Lagos',        slug: 'lagos' },
  { city: 'Accra',        slug: 'accra' },
]

export const LOCAL_CITY_SVG = new Set(['lagos', 'london', 'melbourne', 'sydney'])

export const FALLBACK_SEEDS = [
  { id: 'f1', href: '/events/browse/melbourne', title: 'Afrobeats scene in Melbourne', community: 'Melbourne, VIC',   categorySlug: 'afrobeats' },
  { id: 'f2', href: '/events/browse/sydney',    title: 'Community events in Sydney',   community: 'Sydney, NSW',      categorySlug: 'community' },
  { id: 'f3', href: '/events/browse/brisbane',  title: 'Gospel nights Brisbane',       community: 'Brisbane, QLD',    categorySlug: 'gospel' },
  { id: 'f4', href: '/events/browse/geelong',   title: 'Geelong community scene',      community: 'Geelong, VIC',     categorySlug: 'community' },
  { id: 'f5', href: '/events/browse/perth',     title: 'Diaspora events Perth',        community: 'Perth, WA',        categorySlug: 'heritage-and-independence' },
  { id: 'f6', href: '/events',                  title: 'Regional Australia events',    community: 'Across Australia', categorySlug: 'festival' },
] as const
