import { createPublicClient } from '@/lib/supabase/public-client'
import { loadHomeUpcoming } from '@/lib/events/home-queries'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { featuredThisWeek, weekEndMs, type LedgerRow } from '@/lib/events/ledger-data'
import { createAdminClient } from '@/lib/supabase/admin'
import { featuredWithRecordedRights, readCoverRights } from '@/lib/events/featured-with-recorded-rights'
import type { EventCardData } from './event-card'
import { FeaturedThisWeek } from './ledger-sections'

/**
 * Featured this week above a directory (Lawal's order of 1 November 2026, 11:01), for a page that has not read the
 * week's nights itself: /events, and a city page with its city named. The same rule as the homepage: a rights recorded
 * photograph only, left out under two.
 */
export async function FeaturedThisWeekLoader({ city, link }: { city?: string; link?: { href: string; label: string } }) {
  const now = new Date()
  const rows = (await withVenuePhotos(await loadHomeUpcoming(createPublicClient(), now.toISOString(), 400))) as LedgerRow[]
  const inCity = city ? rows.filter((r) => (r.venue_city ?? '').trim().toLowerCase() === city.trim().toLowerCase()) : rows
  return <FeaturedThisWeek events={await featuredThisWeek(inCity, now)} link={link} />
}

/** The same rule over cards a page already holds (a city page): this week's nights, one per series. */
export async function FeaturedFromCards({ events }: { events: readonly EventCardData[] }) {
  const end = weekEndMs()
  const seen = new Set<string>()
  const week = events.filter((e) => {
    if (!e.cover_image_url || Date.parse(e.start_date) > end) return false
    const key = e.listing_series_id ?? e.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const rights = await readCoverRights(createAdminClient, week.filter((e) => !e.image_credit).map((e) => e.id))
  return <FeaturedThisWeek events={featuredWithRecordedRights(week, rights, 4).map((e) => ({ ...e, cover_rights_recorded: true }))} />
}
