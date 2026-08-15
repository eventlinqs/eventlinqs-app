import type { Organisation } from '@/types/database'
// The SAME currency-map check the charge precondition uses. Imported rather than
// duplicated so the gate and the precondition cannot drift apart on which
// countries are supported.
import { getCurrencyForCountry } from './application-fee'

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

// Mirrors the user-facing message returned by create_reservation when a
// tier's sale window has ended (migration 20260704000005).
export const TICKET_SALES_CLOSED_ERROR =
  'Ticket sales for this event have closed.'

export type SaleWindowState = 'not_yet_open' | 'open' | 'closed'

/**
 * Mirror of the create_reservation sale-window gate (migration
 * 20260704000005), for UI state and pre-flight checks. The database
 * function remains the authoritative enforcement: a NULL sale_start
 * means on sale as soon as the tier is active, a NULL sale_end means
 * sales never auto-close.
 */
export function tierSaleWindowState(
  tier: { sale_start: string | null; sale_end: string | null },
  now: Date = new Date()
): SaleWindowState {
  if (tier.sale_start && now.getTime() < new Date(tier.sale_start).getTime()) return 'not_yet_open'
  if (tier.sale_end && now.getTime() > new Date(tier.sale_end).getTime()) return 'closed'
  return 'open'
}

type OrgSaleFields = Pick<
  Organisation,
  | 'stripe_account_id'
  | 'stripe_charges_enabled'
  | 'stripe_payouts_enabled'
  | 'stripe_account_country'
  | 'payout_status'
>

/**
 * THE SALE GATE AND THE CHARGE PRECONDITION MUST AGREE.
 *
 * THE DEFECT THIS CLOSES. This used to require two things: a connected account
 * and `charges_enabled`. The precondition that actually runs when money moves,
 * `assertOrganiserCanReceiveFunds` in application-fee.ts, requires FOUR:
 * a connected account, `payouts_enabled`, `payout_status === 'active'`, and a
 * country present in the Connect currency map.
 *
 * So an organiser with a connected, charges-enabled account but a NULL
 * `stripe_account_country`, or a payout status on hold, PASSED this gate and
 * FAILED at the payment step. The buyer got the whole way to checkout, chose
 * their tickets, and was then told "Payments for this region are not yet
 * supported" with the button still enabled. `getCurrencyForCountry(null)`
 * returns null, and a null country is the default for an account that has
 * connected but not finished onboarding, so this was reachable rather than
 * theoretical.
 *
 * NEITHER CHECK IS WEAKENED. The precondition still throws on all four; this
 * gate now refuses on the same four, plus `charges_enabled`, which it already
 * required and which is kept. The gate is therefore at least as strict as the
 * precondition on every field, which is the only relationship between them that
 * cannot strand a buyer: an event is offered only if the money can actually
 * move.
 *
 * The currency-map membership is decided by the same function the precondition
 * uses, imported rather than duplicated, so the two cannot drift apart.
 */
export function isOrganiserSellable(org: OrgSaleFields | null | undefined): boolean {
  if (!org) return false
  if (!org.stripe_account_id) return false
  if (org.stripe_charges_enabled !== true) return false
  // Funds-holding: the platform is merchant of record, so what decides whether a
  // sale can complete is the organiser's ability to RECEIVE the later transfer.
  if (org.stripe_payouts_enabled !== true) return false
  if (org.payout_status !== 'active') return false
  if (!getCurrencyForCountry(org.stripe_account_country)) return false
  return true
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
