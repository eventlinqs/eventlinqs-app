import { priceLabel } from '@/lib/events/price-label'
import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import { TICKETS_SOLD_ELSEWHERE_HEADING, isExternallyTicketed } from '@/lib/payments/sale-status'

/**
 * THE PRICE LINE OF A NIGHT IN EVERYTHING WE BROADCAST: the weekly digest, the Launch Kit's captions and its cards.
 *
 * A night sold on another site (WI3: external_ticket_url, no ticket types of ours) is never priced from our ticket
 * types, which read as "Free entry": it names the site it is sold on, as the event page's own button does, or says the
 * page's own words when the site is not a known one. Everything else is priced as before. One function, so the digest
 * and the kit cannot say two different things about one night (window 5's digest fix, bf70bf86, 27 October 2026; the
 * kit's own copy found by window 3 on 28 October 2026).
 */
export function broadcastPriceLabel(
  tiers: { price: number; currency: string | null }[] | null | undefined,
  externalTicketUrl: string | null | undefined,
): string {
  if (isExternallyTicketed({ external_ticket_url: externalTicketUrl ?? null })) {
    const name = PROVIDER_NAMES[providerOf(externalTicketUrl!.trim())]
    return name ? `Tickets on ${name}` : TICKETS_SOLD_ELSEWHERE_HEADING
  }
  return priceLabel(tiers ?? [], 'Free entry')
}
