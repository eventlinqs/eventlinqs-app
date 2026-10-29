import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'
import { HORIZON_DAYS, supplyScorecard, WEEK_DAYS, type SupplyNight, type SupplyScorecard } from './supply-scorecard-math'

/**
 * The rows behind D9's weekly supply scorecard per city (the rules are in ./supply-scorecard-math.ts), for
 * /admin/growth and /admin/today. Read only: published, public nights still listed (the listing window, so a night on
 * now still counts) and starting within the horizon; this week's cancellations; collected events waiting, placed by
 * their source's city; the categories; and the listings account, so its curated nights are never an organiser.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const CATEGORY_CAP = 200

export async function readSupplyScorecard(now: Date = new Date()): Promise<SupplyScorecard> {
  const admin = createAdminClient()
  const until = new Date(now.getTime() + HORIZON_DAYS * DAY_MS).toISOString()
  const weekAgo = new Date(now.getTime() - WEEK_DAYS * DAY_MS).toISOString()

  const [nightRows, cancelled, waiting, sources, categories, listings] = await Promise.all([
    readEveryRow<{
      id: string
      city_primary: string | null
      category_id: string | null
      status: string
      published_at: string | null
      start_date: string
      end_date: string | null
      listing_fresh_until: string | null
      cover_image_url: string | null
      organisation_id: string | null
      listing_series_id: string | null
      is_recurring: boolean
      is_seed_data: boolean
      updated_at: string
    }>('the nights listed and ahead', (f, t) =>
      admin
        .from('events')
        .select('id, city_primary, category_id, status, published_at, start_date, end_date, listing_fresh_until, cover_image_url, organisation_id, listing_series_id, is_recurring, is_seed_data, updated_at')
        .match(PUBLIC_EVENT_MATCH)
        .or(listingWindowOrPredicate(now))
        .lte('start_date', until)
        .order('id', { ascending: true })
        .range(f, t),
    ),
    readEveryRow<{ id: string; city_primary: string | null; updated_at: string; is_seed_data: boolean }>('the nights cancelled this week', (f, t) =>
      admin.from('events').select('id, city_primary, updated_at, is_seed_data').eq('status', 'cancelled').gte('updated_at', weekAgo).order('id', { ascending: true }).range(f, t),
    ),
    readEveryRow<{ id: string; source_id: string }>('the collected events waiting', (f, t) =>
      admin.from('listing_candidates').select('id, source_id').eq('status', 'waiting').order('id', { ascending: true }).range(f, t),
    ),
    readEveryRow<{ id: string; city_slug: string | null }>('the sources and their cities', (f, t) =>
      admin.from('listing_sources').select('id, city_slug').order('id', { ascending: true }).range(f, t),
    ),
    readOrThrow('the categories', () => admin.from('event_categories').select('id, name').order('name', { ascending: true }).limit(CATEGORY_CAP)),
    readOrThrow('the listings account', () => admin.from('organisations').select('id').eq('slug', LISTINGS_ORGANISATION_SLUG).limit(1)),
  ])

  const cityOfSource = new Map(sources.map((s) => [s.id, s.city_slug]))
  const nights: SupplyNight[] = nightRows.map((n) => ({
    id: n.id,
    city: n.city_primary,
    categoryId: n.category_id,
    status: n.status,
    publishedAt: n.published_at,
    startDate: n.start_date,
    endDate: n.end_date,
    freshUntil: n.listing_fresh_until,
    coverUrl: n.cover_image_url,
    organisationId: n.organisation_id,
    seriesId: n.listing_series_id,
    isRecurring: n.is_recurring === true,
    isSeed: n.is_seed_data === true,
    updatedAt: n.updated_at,
  }))

  return supplyScorecard(
    {
      nights,
      cancelled: cancelled.map((c) => ({ city: c.city_primary, updatedAt: c.updated_at, isSeed: c.is_seed_data === true })),
      waiting: waiting.map((w) => ({ city: cityOfSource.get(w.source_id) ?? null })),
      categories: (categories ?? []).map((c) => ({ id: c.id, name: c.name })),
      listingsOrganisationId: listings?.[0]?.id ?? null,
    },
    now,
  )
}
