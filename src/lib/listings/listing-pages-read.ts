import { createAdminClient } from '@/lib/supabase/admin'
import { guideIsPublic } from '@/lib/walk-in/guide-visibility'
import { isEventLinqsListing } from './shown-organiser'
import type { ListingPages } from './outbound'

/**
 * The pages a curated listing's host keeps, for the one button that leaves
 * (src/lib/listings/outbound.ts). Read with the service client, as the guide is
 * (src/lib/walk-in/guide-read.ts), and ONLY for an EventLinqs listing the public
 * may already see: listing_checks is granted to the service role alone, and the
 * address read here is one the page then shows to anybody, so it is read for
 * nothing a visitor could not open.
 *
 * A failed read draws no button rather than a wrong one: it is logged and the
 * page renders without it.
 */
export async function readListingPages(event: {
  id: string
  status?: string | null
  visibility?: string | null
  entry_mode?: string | null
  listing_source?: string | null
  listing_series_id?: string | null
  source_url?: string | null
}): Promise<ListingPages> {
  const own: ListingPages = { sourceUrl: event.source_url ?? null }
  if (!isEventLinqsListing(event) || !guideIsPublic(event) || !event.listing_series_id) return own
  const db = createAdminClient()
  const [series, check] = await Promise.all([
    db.from('event_series').select('instagram_post_url, venue:venues(website_url)').eq('id', event.listing_series_id).maybeSingle(),
    db.from('listing_checks').select('source_url').eq('series_id', event.listing_series_id).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (series.error || check.error) {
    console.error('[listings] the host pages read failed', { eventId: event.id, series: series.error?.message, check: check.error?.message })
    return own
  }
  const row = series.data as { instagram_post_url: string | null; venue: { website_url: string | null } | { website_url: string | null }[] | null } | null
  const venue = Array.isArray(row?.venue) ? row?.venue[0] : row?.venue
  return {
    ...own,
    websiteUrl: venue?.website_url ?? null,
    instagramPostUrl: row?.instagram_post_url ?? null,
    checkedUrl: (check.data as { source_url: string } | null)?.source_url ?? null,
  }
}
