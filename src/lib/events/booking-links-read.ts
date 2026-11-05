import { createPublicClient } from '@/lib/supabase/public-client'
import { BOOKING_LINK_COLUMNS, toBookingLink, type BookingLink, type BookingLinkRow } from './booking-links'

/**
 * An event's booking links as the public reads them (WI3; the table's policy,
 * "Links of a published event are public", 20261027130001), for the event page's
 * one button, its "Also on" line and its Offers. A failed read is logged and
 * answers no links, so the page falls back to events.external_ticket_url, the
 * database's mirror of the button, and never draws a broken panel.
 */
export async function readBookingLinks(eventId: string): Promise<BookingLink[]> {
  const { data, error } = await createPublicClient()
    .from('event_booking_links')
    .select(BOOKING_LINK_COLUMNS)
    .eq('event_id', eventId)
    .order('position', { ascending: true })
    .limit(20)
  if (error) {
    console.error('[booking-links] the links could not be read', { eventId, error: error.message })
    return []
  }
  return ((data ?? []) as unknown as BookingLinkRow[]).map(toBookingLink)
}
