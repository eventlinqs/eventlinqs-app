import { priceLabel } from '@/lib/events/price-label'
import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import { outboundHost } from '@/lib/listings/outbound'
import { ctaFor, ctaPriceLine, type Cta } from '@/lib/events/cta'

/**
 * THE PRICE LINE OF A NIGHT IN EVERYTHING WE BROADCAST: the weekly digest, the Launch Kit's captions and its cards.
 *
 * Read from the event's call to action (src/lib/events/cta.ts, the release checklist's section E): a night sold on
 * another site names the site ("Tickets on Humanitix"), never "Free entry"; a free night says so only when free is
 * stored as checked (a walk-in, our own free ticket types, or is_free set); a night whose price nobody has checked says
 * no price at all. One function, so the digest and the kit cannot say two different things about one night (window 5's
 * digest fix, bf70bf86, 27 October 2026; the kit's own copy found by window 3 on 28 October 2026).
 */
export type BroadcastEvent = {
  ticket_tiers?: readonly { price: number; currency?: string | null; is_active?: boolean | null }[] | null
  external_ticket_url?: string | null
  is_free?: boolean | null
  entry_mode?: string | null
  /** The kind of the outside button's link, when the caller read it (WI3's event_booking_links.kind). */
  external_kind?: string | null
}

/** The name the outside button gives its site: the platform's own, else the host. */
export function outsideName(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  return PROVIDER_NAMES[providerOf(url.trim())] ?? outboundHost(url)
}

export function broadcastCta(event: BroadcastEvent): Cta {
  return ctaFor({
    entryMode: event.entry_mode ?? null,
    tiers: event.ticket_tiers ?? [],
    isFree: event.is_free ?? null,
    externalTicketUrl: event.external_ticket_url ?? null,
    externalKind: event.external_kind ?? null,
    providerName: outsideName(event.external_ticket_url),
  })
}

/** The price line, or '' where nothing may be said about price (an unknown price, E5). */
export function broadcastPriceLabel(event: BroadcastEvent): string {
  const cta = broadcastCta(event)
  const active = (event.ticket_tiers ?? []).filter((t) => t.is_active !== false).map((t) => ({ price: t.price, currency: t.currency ?? null }))
  return ctaPriceLine(cta, { native: active.length > 0 ? priceLabel(active, 'Free entry') : null }) ?? ''
}
