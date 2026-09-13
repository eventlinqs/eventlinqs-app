import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { captureException } from '@/lib/observability/sentry'
import type { EventCardData } from '@/components/features/events/event-card'

/**
 * THE NEWEST PUBLISHED EVENT, for the live-proof block on /organisers.
 *
 * Close-out OL1. From 12 September 2026 every outreach message points a
 * stranger at /organisers, and the page could not show them one event they
 * could open. A screenshot of an event would have been faster and would have
 * been a lie the first time the platform changed; this reads the catalogue.
 *
 * WHAT "NEWEST" MEANS, and why it is not `created_at`. A draft can sit for
 * weeks before it goes live, so the newest CREATED event is not the newest
 * thing a stranger can go and look at. The order is by when the organiser
 * actually published, falling back to creation for rows that predate the
 * column being populated.
 *
 * WHICH EVENTS ARE ELIGIBLE is not decided here. It is composed from
 * applyPublicEventVisibility, the one definition of whether the public may see
 * an event, so this block and every rail and every count answer that question
 * the same way. It carries the listing window with it, which is what keeps an
 * event that has already finished off a block headed "live now".
 *
 * FAILS TO NULL. The block renders nothing when there is nothing to show or the
 * read fails. An empty catalogue is a real state on a launching platform and
 * an invented event would be the exact fabrication Law 4 forbids.
 *
 * Read through the PUBLIC (anon) client, so it resolves the same rows a visitor
 * would and needs no service key on a preview.
 *
 * HOW FRESH IT ACTUALLY IS. /organisers is ISR with `revalidate = 60`, so the
 * card is at most a minute behind the catalogue rather than resolved on every
 * request. That is stated here because "live now" sits beside it on the page
 * and the two claims have to agree: a minute is not live in the sense of a
 * stock ticker, and it is live in the sense that matters, which is that nobody
 * typed it.
 */
export const NEWEST_EVENT_SELECT =
  'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, ' +
  'venue_country, created_at, is_free, published_at, ' +
  'category:event_categories(name, slug), organisation:organisations(name, slug), ' +
  'ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

export async function getNewestPublishedEvent(): Promise<EventCardData | null> {
  try {
    const supabase = createPublicClient()
    // The publication predicate is COMPOSED, never spelled out. A rule written
    // at each call site is a rule per call site, and /events once printed a
    // correct count of 2 beside a rail of 8 deleted events for exactly that
    // reason. applyPublicEventVisibility also applies the listing window, which
    // is the WHEN half and is what keeps a finished event off this block.
    const { data, error } = await applyPublicEventVisibility(
      supabase.from('events').select(NEWEST_EVENT_SELECT),
    )
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // Never swallowed. A discarded error here would render the block empty
      // and read as "the platform has no events", which is the worst thing a
      // recruitment page can say about itself while it is not true.
      console.error('[organisers] could not read the newest published event:', error)
      return null
    }
    return (data as unknown as EventCardData | null) ?? null
  } catch (error) {
    captureException(error, { where: 'lib/organisers/newest-published-event' })
    return null
  }
}
