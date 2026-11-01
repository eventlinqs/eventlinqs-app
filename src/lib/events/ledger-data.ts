/**
 * The rows a page already read, shaped for the Ledger card and for What's on (Lawal's order of 1 November 2026,
 * 11:01). No query of its own except the cover rights, which only the service role may read.
 */
import type { EventCardData } from '@/components/features/events/event-card'
import type { RawRow } from '@/lib/events/home-queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { featuredWithRecordedRights, readCoverRights } from '@/lib/events/featured-with-recorded-rights'
import { isStillListed } from '@/lib/events/listing-window'

export type LedgerRow = RawRow & { readonly image_credit?: string | null; readonly external_ticket_url?: string | null }

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The end of the next seven days, read once per render by the caller. */
export function weekEndMs(now: Date = new Date()): number {
  return now.getTime() + WEEK_MS
}

export function toEventCardData(r: LedgerRow): EventCardData {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    cover_image_url: r.cover_image_url,
    thumbnail_url: r.thumbnail_url,
    start_date: r.start_date,
    timezone: r.timezone,
    venue_name: r.venue_name,
    venue_city: r.venue_city,
    venue_country: r.venue_country,
    created_at: r.created_at,
    category: r.category,
    ticket_tiers: r.ticket_tiers ?? [],
    is_free: r.is_free,
    entry_mode: r.entry_mode,
    external_ticket_url: r.external_ticket_url ?? null,
    image_credit: r.image_credit ?? null,
    listing_series_id: r.listing_series_id ?? null,
  }
}

/** Nights still listed and starting within the next seven days. */
export function thisWeek<T extends LedgerRow>(rows: readonly T[], now: Date): T[] {
  const end = now.getTime() + WEEK_MS
  return rows.filter((r) => isStillListed(r, now) && Date.parse(r.start_date) <= end)
}

/** Up to four Featured nights this week with a rights recorded photograph, soonest first; [] when fewer than two. */
export async function featuredThisWeek(rows: readonly LedgerRow[], now: Date, places = 4): Promise<EventCardData[]> {
  const week = thisWeek(rows, now)
  const rights = await readCoverRights(
    createAdminClient(),
    week.filter((r) => !r.image_credit).map((r) => r.id),
  )
  // One night of a weekly series, not four of the same.
  const seen = new Set<string>()
  const once = week.filter((r) => {
    const key = r.listing_series_id ?? r.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return featuredWithRecordedRights(once, rights, places).map(toEventCardData)
}
