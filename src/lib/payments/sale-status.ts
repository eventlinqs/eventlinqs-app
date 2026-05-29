import type { Organisation } from '@/types/database'

// Single source of truth for "can this event sell tickets right now".
//
// A PAID event can only be checked out when its organiser has a connected,
// charges-enabled Stripe account (the destination-charge pre-condition lives
// in application-fee.ts and runs again at payment time). FREE events need no
// Stripe at all and stay fully sellable. This module is consumed by the
// event-detail page, the ticket selector, and the reservation server action
// so the rule is defined once.

export const TICKETS_NOT_ON_SALE_HEADING = 'Tickets not yet on sale'

export const TICKETS_NOT_ON_SALE_BODY =
  'This organiser is still finishing their payment setup. Tickets for this event go on sale once that is complete. Check back soon.'

// Mirrors the user-facing message returned by createReservation when a paid
// event is blocked server-side.
export const TICKETS_NOT_ON_SALE_RESERVATION_ERROR =
  'Tickets for this event are not on sale yet.'

type OrgSaleFields = Pick<Organisation, 'stripe_account_id' | 'stripe_charges_enabled'>

/** True when the organiser can take card payments (connected + charges enabled). */
export function isOrganiserSellable(org: OrgSaleFields | null | undefined): boolean {
  return !!org && !!org.stripe_account_id && org.stripe_charges_enabled === true
}

/** An event is "paid" when any of the given tiers has a base price above zero. */
export function eventIsPaid(tiers: { price: number }[]): boolean {
  return tiers.some((t) => (t.price ?? 0) > 0)
}

/**
 * Whether tickets for an event are on sale. Free events are always on sale;
 * paid events require a connected, charges-enabled organiser.
 */
export function ticketsOnSale(params: {
  isPaidEvent: boolean
  org: OrgSaleFields | null | undefined
}): boolean {
  if (!params.isPaidEvent) return true
  return isOrganiserSellable(params.org)
}
