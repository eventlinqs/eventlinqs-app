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
 *     The buyer-paid processing fee covers Stripe's actual cost from the
 *     platform balance. Platform stays cash-flow positive on every charge.
 *
 *   mode 2 (stripe_fee_exclusive): app_fee = platform_fee
 *     Only the platform commission is pulled to the platform balance.
 *     The buyer-paid processing fee bonuses to the organiser; Stripe's
 *     actual cost still comes from the platform balance, so the platform
 *     subsidises processing out of its commission. Use sparingly.
 *
 * Mode is resolved by `(country_code, currency, organisationId)` precedence
 * via the pricing-rules service.
 */
export async function computeApplicationFeeCents(
  fees: FeeBreakdown,
  countryCode: string,
  currency: string,
  organisationId?: string | null
): Promise<number> {
  const mode = await getApplicationFeeCompositionMode(countryCode, currency, organisationId)
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
  organisationId?: string | null
): Promise<number> {
  const appFee = await computeApplicationFeeCents(fees, countryCode, currency, organisationId)
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
  organisationId?: string | null
): Promise<number> {
  if (organiserShareCents <= 0) return 0
  const percent = await getReservePercentage(countryCode, currency, organisationId)
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
  fees: FeeBreakdown
): void {
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
