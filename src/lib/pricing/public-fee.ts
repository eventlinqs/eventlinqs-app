/**
 * Canonical public-facing platform fee - for marketing copy only.
 *
 * The source of truth for what organisers are actually CHARGED is the
 * `pricing_rules` table, read at runtime by
 * `src/lib/payments/pricing-rules.ts` and `payment-calculator.ts`. This
 * module mirrors the live AU / GLOBAL `pricing_rules` baseline so that
 * every public surface (the /pricing page and its metadata) states ONE
 * definite number that matches the billing system, with no hedging.
 *
 * It is intentionally a reviewed constant rather than a runtime DB read:
 * a public marketing page must never 500 on a pricing-rules lookup, and
 * the public default never varies by event type. Keep this in sync with
 * the GLOBAL + AU `platform_fee_percentage` and `platform_fee_fixed`
 * rows whenever those baseline rows change.
 *
 * Live values verified against pricing_rules (GLOBAL + AU, AUD, every
 * event type, no organiser override):
 *   platform_fee_percentage = 2.5
 *   platform_fee_fixed      = 50 (cents) = AUD 0.50
 *
 * Follow-up (next session): wire /pricing to read these via
 * getPlatformFeePercentage('AU','AUD') / getPlatformFeeFixedCents with a
 * safe static fallback to these constants, so the page is fully
 * DB-driven without a hard runtime dependency.
 */
export const PUBLIC_PLATFORM_FEE = {
  percent: 2.5,
  fixedCents: 50,
  currency: 'AUD',
} as const

/** e.g. "2.5%" */
export const PUBLIC_FEE_PERCENT_LABEL = `${PUBLIC_PLATFORM_FEE.percent}%`

/** e.g. "AUD 0.50" */
export const PUBLIC_FEE_FIXED_LABEL = `${PUBLIC_PLATFORM_FEE.currency} ${(
  PUBLIC_PLATFORM_FEE.fixedCents / 100
).toFixed(2)}`

/** e.g. "2.5% + AUD 0.50" - the single definite public fee statement */
export const PUBLIC_FEE_LABEL = `${PUBLIC_FEE_PERCENT_LABEL} + ${PUBLIC_FEE_FIXED_LABEL}`
