import type { Organisation } from '@/types/database'
import type { FeeBreakdown } from './payment-calculator'
import {
  getApplicationFeeCompositionMode,
  getReservePercentage,
  type ApplicationFeeCompositionMode,
} from './pricing-rules'

/**
 * Currency that EventLinqs charges in for a given Stripe Connect country.
 *
 * The country-to-currency map is structural (Stripe Connect supports a fixed
 * list of country/currency pairs), not pricing policy. It stays in code; per-
 * country pricing values live in pricing_rules.
 */
const CONNECT_CURRENCY_MAP: Record<string, string> = {
  AU: 'AUD',
  GB: 'GBP',
  US: 'USD',
  CA: 'CAD',
  NZ: 'NZD',
  IE: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  BG: 'EUR',
  HR: 'EUR',
  CY: 'EUR',
  CZ: 'EUR',
  DK: 'EUR',
  EE: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  GR: 'EUR',
  HU: 'EUR',
  IT: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PL: 'EUR',
  PT: 'EUR',
  RO: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  ES: 'EUR',
  SE: 'EUR',
}

export type ChargePreconditionFailure =
  | 'org_not_connected'
  | 'org_charges_disabled'
  | 'org_payouts_restricted'
  | 'org_country_unsupported'
  | 'fee_breakdown_invalid'
  /** The event sells its tickets on another platform. We never take money for it. */
  | 'event_externally_ticketed'

export class ChargePreconditionError extends Error {
  readonly reason: ChargePreconditionFailure
  constructor(reason: ChargePreconditionFailure, message: string) {
    super(message)
    this.name = 'ChargePreconditionError'
    this.reason = reason
  }
}

export function getCurrencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null
  return CONNECT_CURRENCY_MAP[country.toUpperCase()] ?? null
}

/**
 * Application fee handed to Stripe for a destination charge, composed
 * according to the per-region/per-org `application_fee_composition_mode`
 * rule.
 *
 *   mode 1 (stripe_fee_inclusive, default): app_fee = platform_fee + processing_fee
 *   mode 2 (stripe_fee_exclusive):          app_fee = platform_fee
 *
 * ONE FEE (founder ruling 15 August 2026): THE TWO MODES NOW PRODUCE THE SAME
 * NUMBER, and that is worth stating rather than leaving to be rediscovered.
 * `processing_fee` is 0 on every order priced after that date, so mode 1's
 * `platform_fee + 0` and mode 2's `platform_fee` are identical. The mode is kept
 * and still resolved because it is meaningful for HISTORICAL orders, whose
 * stored `processing_fee_cents` is non-zero and whose payout must compose the
 * way it did when the money moved.
 *
 * ONE-FEE-ALLOW-BEGIN: records what the modes meant historically, which the
 * payout path still needs for orders placed before the deletion.
 * What the modes meant while there were two fees: mode 1 pulled the buyer-paid
 * processing fee to the platform balance to cover Stripe's actual cost, keeping
 * the platform cash-flow positive per charge; mode 2 left it with the organiser
 * and had the platform subsidise processing out of its commission.
 * ONE-FEE-ALLOW-END
 *
 * Mode is resolved by `(country_code, currency, organisationId)` precedence
 * via the pricing-rules service.
 */
export async function computeApplicationFeeCents(
  fees: FeeBreakdown,
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const mode = await getApplicationFeeCompositionMode(countryCode, currency, organisationId, eventId ?? null)
  return composeApplicationFee(fees, mode)
}

/**
 * Pure helper used by tests and synchronous call sites that already know
 * the composition mode.
 */
export function composeApplicationFee(
  fees: FeeBreakdown,
  mode: ApplicationFeeCompositionMode
): number {
  if (mode === 1) {
    return fees.platform_fee_cents + fees.payment_processing_fee_cents
  }
  return fees.platform_fee_cents
}

/**
 * What the connected account receives. For destination charges,
 * destination = total_cents - application_fee.
 */
export async function computeOrganiserShareCents(
  fees: FeeBreakdown,
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  const appFee = await computeApplicationFeeCents(fees, countryCode, currency, organisationId, eventId ?? null)
  return fees.total_cents - appFee
}

/**
 * Reserve amount written to `payout_holds` on order success. Reserve percent
 * comes from pricing_rules (rule_type='reserve_percentage'). Floor to keep
 * integer math conservative (we never hold more than the percentage).
 */
export async function computeReserveCents(
  organiserShareCents: number,
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  if (organiserShareCents <= 0) return 0
  const percent = await getReservePercentage(countryCode, currency, organisationId, eventId ?? null)
  return Math.floor((organiserShareCents * percent) / 100)
}

/**
 * Hard pre-condition check for paid-event destination charges. Throws
 * `ChargePreconditionError` on the first failure so the calling checkout
 * action can map the typed reason to a user-facing message.
 *
 * The fee composition is checked against mode 1 only: if the platform
 * configures mode 2 in pricing_rules, the per-charge math is `platform_fee`
 * which is always smaller than mode 1's `platform_fee + processing_fee`,
 * so a mode-1-passing FeeBreakdown is implicitly safe under mode 2.
 *
 * Free events (`fees.total_cents === 0`) MUST NOT call this; they bypass
 * Stripe entirely.
 */
export function assertCanCreateDestinationCharge(
  org: Pick<
    Organisation,
    | 'stripe_account_id'
    | 'stripe_charges_enabled'
    | 'stripe_account_country'
    | 'payout_status'
  >,
  fees: FeeBreakdown,
  /**
   * The event being charged for, when the caller has it. Optional so every
   * existing internal call site compiles and behaves identically.
   */
  event?: { external_ticket_url?: string | null } | null
): void {
  /*
   * EXTERNAL TICKETING: refuse before anything else. Founder ruling 15 August
   * 2026, non-negotiable 3.
   *
   * This is the SECOND of the two independent refusals, and it exists precisely
   * because the first one can be bypassed. `ticketsOnSale` governs what the page
   * RENDERS; this governs whether money can MOVE. A caller that reached here
   * with an externally ticketed event has already gone wrong, and the right
   * answer is to throw rather than to charge a buyer for a ticket this platform
   * does not sell and cannot deliver.
   *
   * It is checked first so no combination of organiser state can reach a charge
   * for an event whose tickets are somebody else's to sell.
   */
  if (event && typeof event.external_ticket_url === 'string' && event.external_ticket_url.trim().length > 0) {
    throw new ChargePreconditionError(
      'event_externally_ticketed',
      'Event is externally ticketed: EventLinqs sells no tickets for it and must never take a payment for it.'
    )
  }
  if (!org.stripe_account_id) {
    throw new ChargePreconditionError(
      'org_not_connected',
      'Organisation has no connected Stripe account.'
    )
  }
  if (!org.stripe_charges_enabled) {
    throw new ChargePreconditionError(
      'org_charges_disabled',
      'Organisation Stripe account cannot accept charges.'
    )
  }
  if (org.payout_status !== 'active') {
    throw new ChargePreconditionError(
      'org_payouts_restricted',
      `Organisation payout status is ${org.payout_status}; charges are paused.`
    )
  }
  if (!getCurrencyForCountry(org.stripe_account_country)) {
    throw new ChargePreconditionError(
      'org_country_unsupported',
      `Organisation country "${org.stripe_account_country ?? 'null'}" is not in the v1 Connect currency map.`
    )
  }
  if (fees.total_cents <= 0) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      'FeeBreakdown.total_cents must be positive for a paid-event charge.'
    )
  }
  // Inclusive composition is the strictest case; if it would round to zero
  // or exceed total, the FeeBreakdown is malformed regardless of mode.
  const inclusiveAppFee = composeApplicationFee(fees, 1)
  if (inclusiveAppFee <= 0) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      'Computed application fee is zero or negative; pricing_rules likely returned no platform fee.'
    )
  }
  if (inclusiveAppFee >= fees.total_cents) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      `Computed application fee (${inclusiveAppFee}) is not less than total (${fees.total_cents}); destination would receive zero or negative.`
    )
  }
}

// ── Funds-holding model (docs/PAYMENTS-FUNDS-HOLDING.md) ────────────────────

/**
 * The amount transferred to the organiser's connected account at disbursement.
 * Under separate charges and transfers the platform realises its fee by
 * transferring LESS than the gross, instead of a Stripe `application_fee_amount`
 * (Stage 5). The math is identical to `computeOrganiserShareCents`
 * (total - the platform's keep), composed per the same pricing_rules mode, so
 * the single-source fee law is unchanged: organiser gets the ticket price, the
 * platform keeps its percentage + flat fee.
 */
export async function computeOrganiserTransferCents(
  fees: FeeBreakdown,
  countryCode: string,
  currency: string,
  organisationId?: string | null,
  eventId?: string | null
): Promise<number> {
  return computeOrganiserShareCents(fees, countryCode, currency, organisationId, eventId ?? null)
}

/**
 * Pre-condition for SELLING a ticket under the funds-holding model. The buyer
 * charge is a PLATFORM charge (the platform is merchant of record), so the
 * organiser's `charges_enabled` is irrelevant here; what matters is that the
 * organiser can RECEIVE the later platform->connected transfer/payout. We still
 * refuse to sell for an organiser who is not connected, cannot be paid out, is
 * on hold, or sits in an unsupported country. Throws `ChargePreconditionError`.
 */
export function assertOrganiserCanReceiveFunds(
  org: Pick<
    Organisation,
    | 'stripe_account_id'
    | 'stripe_payouts_enabled'
    | 'stripe_account_country'
    | 'payout_status'
  >,
  fees: FeeBreakdown
): void {
  if (!org.stripe_account_id) {
    throw new ChargePreconditionError(
      'org_not_connected',
      'Organisation has no connected Stripe account.'
    )
  }
  if (!org.stripe_payouts_enabled) {
    throw new ChargePreconditionError(
      'org_charges_disabled',
      'Organisation Stripe account cannot receive funds yet (payouts not enabled).'
    )
  }
  if (org.payout_status !== 'active') {
    throw new ChargePreconditionError(
      'org_payouts_restricted',
      `Organisation payout status is ${org.payout_status}; sales are paused.`
    )
  }
  if (!getCurrencyForCountry(org.stripe_account_country)) {
    throw new ChargePreconditionError(
      'org_country_unsupported',
      `Organisation country "${org.stripe_account_country ?? 'null'}" is not in the v1 Connect currency map.`
    )
  }
  if (fees.total_cents <= 0) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      'FeeBreakdown.total_cents must be positive for a paid-event charge.'
    )
  }
  // The platform's keep (inclusive composition) must be positive and strictly
  // less than the total, else the organiser transfer would be zero or negative.
  const inclusiveKeep = composeApplicationFee(fees, 1)
  if (inclusiveKeep <= 0) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      'Computed platform fee is zero or negative; pricing_rules likely returned no platform fee.'
    )
  }
  if (inclusiveKeep >= fees.total_cents) {
    throw new ChargePreconditionError(
      'fee_breakdown_invalid',
      `Computed platform fee (${inclusiveKeep}) is not less than total (${fees.total_cents}); organiser would receive zero or negative.`
    )
  }
}
