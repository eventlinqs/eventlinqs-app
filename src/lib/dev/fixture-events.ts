import type { RawRow } from '@/lib/events/home-queries'
import type {
  Event, TicketTier, Organisation, EventCategory, EventAddon,
} from '@/types/database'

/**
 * Shared single source of truth for the preview density fixture.
 *
 * The homepage rails (`loadHomeUpcoming`) and the event-detail data path (the
 * `events/[slug]` existence guard + `fetchEvent`) BOTH read this one fixture
 * under `HOMEPAGE_SEED_FIXTURE=1`, so a homepage fixture card always resolves
 * to a fully rendered detail page instead of a 404. Density and detail can
 * never diverge because they read the same file.
 *
 * DOUBLE GUARD (identical to `loadHomeUpcoming`): the flag is honoured only
 * when `VERCEL_ENV` is not `'production'`. Even if `HOMEPAGE_SEED_FIXTURE`
 * were ever set on a Production deployment, every consumer here returns the
 * empty/no-op path, so the fixture can never leak into production data. The
 * flag is a Preview-only Vercel env var (see `.env.example`).
 */
export function fixtureEnabled(): boolean {
  return (
    process.env.HOMEPAGE_SEED_FIXTURE === '1' &&
    process.env.VERCEL_ENV !== 'production'
  )
}

/**
 * The fixture row is a SUPERSET of the homepage `RawRow`: it carries the extra
 * event-detail fields (`description`, `end_date`, `timezone`, `venue_address`,
 * `event_type`, `status`, `visibility`, `tags`) plus a richer organisation and
 * ticket-tier shape, written by `scripts/seed-events-catalogue.mjs --fixture`.
 * The homepage reads only the `RawRow` subset; the detail path reads the rest.
 */
type FixtureTier = NonNullable<RawRow['ticket_tiers']>[number] & {
  name: string
  min_per_order: number
  max_per_order: number
  sort_order: number
  is_visible: boolean
  is_active: boolean
  requires_access_code: boolean
  tier_type: string
  dynamic_pricing_enabled: boolean
  sale_start: string | null
  sale_end: string | null
  description: string | null
}

type FixtureRow = Omit<RawRow, 'organisation' | 'ticket_tiers'> & {
  description: string | null
  end_date: string
  timezone: string
  event_type: string
  status: string
  visibility: string
  venue_address: string | null
  tags: string[] | null
  organisation: {
    id: string
    name: string
    slug: string
    description: string | null
    stripe_account_id: string | null
    stripe_charges_enabled: boolean
  }
  ticket_tiers: FixtureTier[]
}

/** The detail page's full-event shape (mirrors `FullEvent` in the route). */
export type FixtureFullEvent = Event & {
  ticket_tiers: TicketTier[]
  organisation: Organisation
  category: EventCategory | null
  event_addons: EventAddon[]
}

const FIXTURE_PATH = 'src/lib/dev/home-seed-fixture.json'

let cache: FixtureRow[] | null = null

/**
 * Read the density fixture from disk (cached per process). Returns `[]` if the
 * file is absent so a missing fixture is a clean no-op, never a thrown error.
 * The file is traced into the serverless bundle for `/` and `/events/[slug]`
 * via `outputFileTracingIncludes` in `next.config.ts`.
 */
async function readFixture(): Promise<FixtureRow[]> {
  if (cache) return cache
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  try {
    const raw = await readFile(resolve(process.cwd(), FIXTURE_PATH), 'utf8')
    cache = JSON.parse(raw) as FixtureRow[]
  } catch {
    cache = []
  }
  return cache
}

/** Homepage rails consume the `RawRow` subset. */
export async function loadFixtureRows(): Promise<RawRow[]> {
  return (await readFixture()) as unknown as RawRow[]
}

/** Find a single fixture row by slug (guard-gated). */
async function findFixtureRow(slug: string): Promise<FixtureRow | null> {
  if (!fixtureEnabled()) return null
  const rows = await readFixture()
  return rows.find(r => r.slug === slug) ?? null
}

/**
 * True when a fixture event with this slug exists (guard-gated). Used by the
 * detail route's existence guard so a fixture card does not `notFound()`.
 */
export async function fixtureEventExists(slug: string): Promise<boolean> {
  return (await findFixtureRow(slug)) !== null
}

function synthTier(t: FixtureTier, eventId: string): TicketTier {
  return {
    id: t.id,
    event_id: eventId,
    name: t.name,
    description: t.description,
    tier_type: t.tier_type,
    price: t.price,
    currency: t.currency,
    total_capacity: t.total_capacity,
    sold_count: t.sold_count,
    reserved_count: t.reserved_count,
    min_per_order: t.min_per_order,
    max_per_order: t.max_per_order,
    sort_order: t.sort_order,
    is_visible: t.is_visible,
    is_active: t.is_active,
    requires_access_code: t.requires_access_code,
    dynamic_pricing_enabled: t.dynamic_pricing_enabled,
    sale_start: t.sale_start,
    sale_end: t.sale_end,
    hidden_until: null,
    seat_map_section_id: null,
    metadata: null,
    created_at: t.sale_start ?? '2026-06-06T00:00:00Z',
    updated_at: '2026-06-06T00:00:00Z',
  } as unknown as TicketTier
}

/**
 * Build a full detail-page event from a fixture row (guard-gated). Returns
 * `null` for unknown slugs, so the route falls through to its real-DB query.
 * Scalar columns the fixture does not carry are filled with inert defaults
 * (no reserved seating, not age-restricted, no geocode), which the detail
 * template renders cleanly.
 */
export async function fetchFixtureEvent(slug: string): Promise<FixtureFullEvent | null> {
  const r = await findFixtureRow(slug)
  if (!r) return null

  const org = {
    id: r.organisation.id,
    name: r.organisation.name,
    slug: r.organisation.slug,
    description: r.organisation.description,
    stripe_account_id: r.organisation.stripe_account_id,
    stripe_charges_enabled: r.organisation.stripe_charges_enabled,
    stripe_payouts_enabled: true,
    stripe_onboarding_complete: true,
    status: 'active',
    logo_url: null,
    email: null,
    phone: null,
    website: null,
    owner_id: r.organisation.id,
    created_at: '2026-06-06T00:00:00Z',
    updated_at: '2026-06-06T00:00:00Z',
  } as unknown as Organisation

  const category: EventCategory | null = r.category
    ? ({ name: r.category.name, slug: r.category.slug } as unknown as EventCategory)
    : null

  const event = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    description: r.description,
    cover_image_url: r.cover_image_url,
    thumbnail_url: r.thumbnail_url,
    gallery_urls: r.gallery_urls,
    start_date: r.start_date,
    end_date: r.end_date,
    timezone: r.timezone,
    event_type: r.event_type,
    status: r.status,
    visibility: r.visibility,
    venue_name: r.venue_name,
    venue_address: r.venue_address,
    venue_city: r.venue_city,
    venue_state: r.venue_state,
    venue_country: r.venue_country,
    venue_latitude: null,
    venue_longitude: null,
    venue_id: null,
    venue_place_id: null,
    venue_postal_code: null,
    virtual_url: null,
    is_free: r.is_free,
    is_age_restricted: false,
    age_restriction_min: null,
    has_reserved_seating: false,
    seat_map_id: null,
    is_featured: false,
    is_high_demand: false,
    is_multi_day: false,
    is_recurring: false,
    waitlist_enabled: false,
    squad_booking_enabled: false,
    squad_timeout_hours: 24,
    queue_admission_window_minutes: 10,
    max_capacity: r.ticket_tiers.reduce((a, t) => a + t.total_capacity, 0),
    tags: r.tags,
    metadata: null,
    fee_pass_type: 'pass_to_buyer',
    // category_id null: skips the by-category related query (synthetic ids
    // never match the real catalogue); the city-match related query still
    // surfaces real events on the page.
    category_id: null,
    organisation_id: r.organisation.id,
    created_by: r.organisation.id,
    parent_event_id: null,
    recurrence_rule: null,
    scheduled_publish_at: null,
    published_at: '2026-06-06T00:00:00Z',
    city_primary: null,
    community_primary: null,
    sub_community: null,
    suburb_primary: null,
    genre_slug: null,
    subgenre_slug: null,
    created_at: r.created_at,
    updated_at: r.created_at,
    category,
    organisation: org,
    ticket_tiers: r.ticket_tiers.map(t => synthTier(t, r.id)),
    event_addons: [] as EventAddon[],
  }

  return event as unknown as FixtureFullEvent
}
