import { createPublicClient } from '@/lib/supabase/public-client'
import type { BookingLink } from './booking-links'

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
    .select('id, provider, url, kind, availability, price_from_cents, price_checked_at, is_primary, set_by, pointed_to_by_organiser, position, created_at')
    .eq('event_id', eventId)
    .order('position', { ascending: true })
    .limit(20)
  if (error) {
    console.error('[booking-links] the links could not be read', { eventId, error: error.message })
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider as BookingLink['provider'],
    url: r.url,
    kind: r.kind as BookingLink['kind'],
    availability: r.availability as BookingLink['availability'],
    priceFromCents: r.price_from_cents,
    priceCheckedAt: r.price_checked_at,
    isPrimary: r.is_primary,
    setBy: r.set_by as BookingLink['setBy'],
    pointedToByOrganiser: r.pointed_to_by_organiser,
    position: r.position,
    createdAt: r.created_at,
  }))
}
