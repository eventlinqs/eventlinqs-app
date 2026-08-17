import type { Organisation } from '@/types/database'
// The SAME currency-map check the charge precondition uses. Imported rather than
// duplicated so the gate and the precondition cannot drift apart on which
// countries are supported.
import { getCurrencyForCountry } from './application-fee'
// One mechanism for every gate boundary. See required-fields.ts for why a cast
// is not enough and why absent is not false.
import { verifyRowFields } from './required-fields'

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

/* ===========================================================================
 * A GATE CANNOT BE ALLOWED TO RUN ON AN INCOMPLETE SET OF FIELDS.
 * ===========================================================================
 *
 * FOUNDER RULING, 18 August 2026, after the second outage of the same shape in
 * one week: "If a value is required, the type system must refuse to compile
 * without it. A field that can silently arrive undefined and be read as false is
 * the root cause of this evening."
 *
 * THE SHAPE, twice now. This gate reads five fields, and nothing tied the QUERY
 * that supplies them to the RULE that reads them.
 *
 *   15 August: a security migration revoked two of the five from anon. The embed
 *              was narrowed correctly, the gate went on reading all five, the two
 *              revoked ones arrived `undefined`, and `undefined !== true` refused
 *              EVERY PAID EVENT on the platform.
 *   18 August: the reservation guard named `events.external_ticket_url` in a
 *              select. The column did not exist on production, PostgREST failed
 *              the whole request, the caller discarded the error, and the
 *              organisation was never read at all. Same outcome.
 *
 * Both are the same design flaw, not two typos: ABSENT and FALSE were the same
 * answer to this function, and absent is not an answer at all. "This organiser
 * cannot sell" and "I could not find out whether this organiser can sell" are
 * different facts, and only one of them is the organiser's to fix.
 *
 * THE FIX IS A TYPE, NOT A CHECK. `isOrganiserSellable` no longer accepts a bag
 * of fields. It accepts `VerifiedOrgSaleFields`, which carries a unique symbol
 * that NOTHING outside this module can produce. The only way to obtain one is
 * `verifyOrgSaleFields`, which asserts every required key is PRESENT on the row
 * before handing it over. A caller who narrows their select now fails to
 * compile, and a caller whose row loses a column at runtime gets a distinct
 * `sale_lookup_failed`, never a refusal about payment setup.
 *
 * PRESENCE, NOT TRUTH. The check is `key in row`, not `row[key] != null`. A NULL
 * country is a legitimate value that correctly refuses the sale; a MISSING
 * country column is a programming error. Collapsing those two is the whole bug.
 * =========================================================================== */

/**
 * The exact column list this gate needs, as one string.
 *
 * EVERY query that feeds the gate selects THIS, rather than its own hand-typed
 * list. Two hand-typed lists is how one of them ends up short, and the failure is
 * silent because a short list still returns a row.
 */
export const ORG_SALE_FIELDS_SELECT =
  'stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, payout_status'

/** The same five, as keys, for the presence assertion. Derived from one source. */
export const ORG_SALE_FIELD_KEYS = ORG_SALE_FIELDS_SELECT.split(',').map((s) => s.trim()) as Array<
  keyof OrgSaleFields
>

declare const verifiedOrgSaleFields: unique symbol

/**
 * A row PROVEN to carry all five gate fields. Unforgeable outside this module:
 * the symbol is not exported, so `verifyOrgSaleFields` is the only way in.
 */
export type VerifiedOrgSaleFields = OrgSaleFields & {
  readonly [verifiedOrgSaleFields]: true
}

export type OrgFieldsVerdict =
  | { complete: true; org: VerifiedOrgSaleFields }
  /** The row exists but is missing columns the gate requires. A BUG, not a state. */
  | { complete: false; missing: string[] }

/**
 * Prove a row carries every field the gate reads.
 *
 * IT THROWS IN DEVELOPMENT AND IN TEST, deliberately, because a missing column is
 * a programming error and the founder ruling is explicit that it "must fail
 * loudly in development, never quietly refuse a sale in production". In
 * production it returns the incomplete verdict, which every caller maps to
 * `sale_lookup_failed`: a live platform must not crash a buyer's page over a
 * schema problem, but it must not tell them a lie about it either.
 */
export function verifyOrgSaleFields(row: unknown): OrgFieldsVerdict {
  const verdict = verifyRowFields<VerifiedOrgSaleFields>(row, ORG_SALE_FIELD_KEYS, 'sale-gate')
  return verdict.complete
    ? { complete: true, org: verdict.row }
    : { complete: false, missing: verdict.missing }
}

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
/**
 * THE SIGNATURE IS THE GUARANTEE. `VerifiedOrgSaleFields` cannot be constructed
 * outside this module, so there is no way to reach this function with a row that
 * has not been proven to carry all five fields. The `!org` branch is gone with
 * it: a null organisation is no longer this function's problem to represent,
 * because it can no longer be handed one.
 */
export function isOrganiserSellable(org: VerifiedOrgSaleFields): boolean {
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
 * EXTERNAL TICKETING: this event sells somewhere else, so EventLinqs sells
 * nothing for it. Founder ruling 15 August 2026.
 *
 * WHY IT IS A FUNCTION OVER THE EVENT AND NOT A BOOLEAN FLAG. The ruling was
 * explicit that the refusal must hold "by construction, not by a flag someone
 * can forget". A separate `isExternal` boolean would have to be passed correctly
 * at every call site, and the call site that forgot would render a checkout for
 * an event that cannot take money. Instead the URL itself IS the state: an event
 * carrying `external_ticket_url` is externally ticketed, there is no second
 * source to disagree with it, and `ticketsOnSale` reads it first and returns
 * before any other consideration.
 */
export type ExternalTicketFields = { external_ticket_url?: string | null }

export function isExternallyTicketed(
  event: ExternalTicketFields | null | undefined,
): boolean {
  const url = event?.external_ticket_url
  return typeof url === 'string' && url.trim().length > 0
}

/** What the event page says instead of a ticket selector. */
export const TICKETS_SOLD_ELSEWHERE_HEADING = 'Tickets are sold elsewhere'

export const TICKETS_SOLD_ELSEWHERE_BODY =
  'This organiser sells tickets for this event on another site. The button below takes you straight there.'

/**
 * What the reservation action returns if anything ever asks it to hold seats for
 * an externally ticketed event. Unreachable through the UI, which is why it says
 * what is true rather than apologising for an error.
 */
export const TICKETS_SOLD_ELSEWHERE_RESERVATION_ERROR =
  'Tickets for this event are sold on another site, so there is nothing to reserve here.'

/**
 * Whether tickets for an event are on sale HERE. Free events are always on sale;
 * paid events require a connected, charges-enabled organiser; an externally
 * ticketed event is NEVER on sale here, whatever else is true of it.
 *
 * The external check runs FIRST and unconditionally, before the paid/free split
 * and before any organiser state is consulted. That ordering is the whole
 * guarantee: there is no combination of organiser fields, tier prices or feature
 * flags that can make an externally ticketed event sellable here, because none
 * of them is reached.
 */
export function ticketsOnSale(params: {
  isPaidEvent: boolean
  org: OrgSaleFields | null | undefined
  event?: ExternalTicketFields | null
}): boolean {
  return ticketsOnSaleDetailed(params).onSale
}

/* ===========================================================================
 * WHY A REASON AND NOT A BOOLEAN
 * ===========================================================================
 *
 * THE INCIDENT, 18 August 2026. A founder spent hours editing "sales start"
 * dates on a live event that would not sell. There is no sales-start column on
 * an event in this codebase, so every edit was a no-op against a field that does
 * not exist. He was sent there by the refusal itself, which read "Tickets for
 * this event are not on sale yet" and named no cause.
 *
 * The actual cause was neither a sale window nor the organiser's Stripe posture,
 * which was perfect on all five fields. `events.external_ticket_url` did not
 * exist on production, because 20260815000001 had not been applied. The
 * reservation guard names that column in a select, so PostgREST failed the whole
 * request, the call site discarded the error, and the event row arrived as null.
 * A null event meant the organisation was never read, and a null organisation is
 * correctly refused. Every paid event on the platform was refused this way.
 *
 * So the refusal had THREE different causes that all produced ONE sentence, and
 * that sentence pointed at the only one of the three that does not exist. A
 * boolean cannot carry a cause. That is the defect this type closes.
 *
 * TWO AUDIENCES, DELIBERATELY DIFFERENT. A buyer must never be shown Stripe
 * internals or a platform fault they cannot act on. The organiser who owns the
 * event must be shown the real cause and the ONE control that clears it. Both
 * come from here, so they can never drift into telling different stories.
 * =========================================================================== */

export type SaleRefusalReason =
  /** Sold on another platform. We never take money for it. */
  | 'externally_ticketed'
  /** Paid event, organiser cannot yet receive funds. The honest, common case. */
  | 'organiser_payment_setup_incomplete'
  /**
   * A READ FAILED. This is NOT a refusal and must never be worded as one: it
   * means the platform could not establish sellability at all. It exists so a
   * schema error, a dropped connection or a permissions change can never again
   * be reported to a human as a sales-window problem.
   */
  | 'sale_lookup_failed'

export type SaleAudience = 'buyer' | 'organiser'

export interface SaleRefusal {
  reason: SaleRefusalReason
  heading: string
  body: string
  /** The single control that clears it. Organiser audience only; null for a buyer. */
  action: { label: string; href: string } | null
}

export type SaleDecision =
  | { onSale: true; reason: null }
  | { onSale: false; reason: SaleRefusalReason }

/**
 * The one sellability decision, carrying its cause.
 *
 * `orgLookupFailed` is passed by a caller whose organiser read ERRORED, as
 * distinct from a caller who read successfully and got nothing back. Both refuse
 * the sale, and they must: fail closed. They are told apart only so the human
 * reading the refusal is told the truth about which one happened.
 */
export function ticketsOnSaleDetailed(params: {
  isPaidEvent: boolean
  event?: ExternalTicketFields | null
  lookupFailed?: boolean
  /**
   * The organisation row AS READ, unverified, for a caller that HAS it.
   *
   * It is verified here rather than by the caller, so a caller cannot forget. A
   * row missing gate columns yields `sale_lookup_failed`, never a refusal about
   * payment setup, because those are different facts.
   */
  org?: unknown
  /**
   * The verdict, for a caller that has already collapsed the row to a boolean.
   *
   * The event page must do exactly that: it reads the Stripe posture with the
   * service role and reduces it to one boolean BEFORE anything crosses the
   * client boundary, so no Stripe account identifier ever reaches the RSC
   * payload. Handing that caller an `org` shape would mean inventing a fake row,
   * so it hands its answer instead. Exactly one of `org` or `organiserSellable`
   * is meaningful per call.
   */
  organiserSellable?: boolean
}): SaleDecision {
  if (params.lookupFailed) return { onSale: false, reason: 'sale_lookup_failed' }
  if (isExternallyTicketed(params.event)) return { onSale: false, reason: 'externally_ticketed' }
  if (!params.isPaidEvent) return { onSale: true, reason: null }

  if (params.organiserSellable !== undefined) {
    return params.organiserSellable
      ? { onSale: true, reason: null }
      : { onSale: false, reason: 'organiser_payment_setup_incomplete' }
  }

  // No organisation row at all is a legitimate state: the event's organiser could
  // not be found, so the sale is refused for the ordinary reason.
  if (params.org === null || params.org === undefined) {
    return { onSale: false, reason: 'organiser_payment_setup_incomplete' }
  }

  // A row that is PRESENT but missing gate columns is a programming error, and it
  // gets its own answer. This is the branch that would have told the truth on
  // both 15 and 18 August instead of blaming the organiser's payment setup.
  const verdict = verifyOrgSaleFields(params.org)
  if (!verdict.complete) return { onSale: false, reason: 'sale_lookup_failed' }

  return isOrganiserSellable(verdict.org)
    ? { onSale: true, reason: null }
    : { onSale: false, reason: 'organiser_payment_setup_incomplete' }
}

export function describeSaleRefusal(
  reason: SaleRefusalReason,
  audience: SaleAudience,
): SaleRefusal {
  switch (reason) {
    case 'externally_ticketed':
      return {
        reason,
        heading: TICKETS_SOLD_ELSEWHERE_HEADING,
        body: TICKETS_SOLD_ELSEWHERE_BODY,
        action: null,
      }

    case 'organiser_payment_setup_incomplete':
      return audience === 'organiser'
        ? {
            reason,
            heading: 'Your tickets are not on sale',
            body:
              'EventLinqs cannot take money for this event until your payment setup is complete, so buyers currently see a holding message instead of a checkout. Finishing it puts your tickets on sale straight away.',
            action: { label: 'Finish payment setup', href: '/dashboard/payouts' },
          }
        : {
            reason,
            heading: TICKETS_NOT_ON_SALE_HEADING,
            body: TICKETS_NOT_ON_SALE_BODY,
            action: null,
          }

    case 'sale_lookup_failed':
      // NEVER worded as a sale window, for either audience. The founder was sent
      // to edit dates for hours by a message that guessed. This one says what is
      // actually true: we could not tell, and it is our fault, not a setting.
      return audience === 'organiser'
        ? {
            reason,
            heading: 'We could not check this event',
            body:
              'EventLinqs could not read this event well enough to confirm it can sell tickets. This is a fault on our side and not a setting you can change. It has been logged and nothing about your event is wrong.',
            action: null,
          }
        : {
            reason,
            heading: 'Tickets are briefly unavailable',
            body:
              'We could not load ticket availability for this event just now. Please refresh the page in a moment.',
            action: null,
          }
  }
}

/**
 * What the reservation action returns to a BUYER for a given cause. The client
 * latches on the reason, not on this string, so the wording can change without
 * anything downstream having to re-parse prose.
 */
export function saleRefusalMessage(reason: SaleRefusalReason): string {
  if (reason === 'externally_ticketed') return TICKETS_SOLD_ELSEWHERE_RESERVATION_ERROR
  return describeSaleRefusal(reason, 'buyer').body
}

/* ---------------------------------------------------------------------------
 * TIER-LEVEL CAUSES. A tier can be unavailable for reasons that have nothing to
 * do with the organiser, and rolling them into the same sentence is how "not on
 * sale yet" came to mean four different things.
 * ------------------------------------------------------------------------- */

export type TierUnavailableReason = 'sale_not_yet_open' | 'sale_closed' | 'sold_out'

export function describeTierUnavailable(
  reason: TierUnavailableReason,
  audience: SaleAudience,
): { label: string; detail: string } {
  switch (reason) {
    case 'sale_not_yet_open':
      return {
        label: 'Not yet on sale',
        detail:
          audience === 'organiser'
            ? 'This tier has a sale start in the future, so buyers cannot select it yet. Clear the sale start to put it on sale now.'
            : 'This ticket type goes on sale later.',
      }
    case 'sale_closed':
      return {
        label: 'Sales closed',
        detail:
          audience === 'organiser'
            ? 'This tier has a sale end in the past, so buyers can no longer select it. Extend or clear the sale end to reopen it.'
            : 'Sales for this ticket type have closed.',
      }
    case 'sold_out':
      return {
        label: 'Sold out',
        detail:
          audience === 'organiser'
            ? 'Every ticket in this tier is sold or held. Raise the capacity to sell more.'
            : 'This ticket type is sold out.',
      }
  }
}
