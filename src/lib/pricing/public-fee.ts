/**
 * LAST-RESORT platform-fee fallback. NOT a second source of truth.
 *
 * The ONE source of truth for every fee - charged, paid out, AND displayed - is
 * the `pricing_rules` table, resolved through `getPricingRule`
 * (`src/lib/payments/pricing-rules.ts`). The public display reads it live via
 * `getLivePublicFee()` (`src/lib/pricing/live-fee.ts`), so the displayed fee
 * always equals the charged fee.
 *
 * This constant exists ONLY so a public marketing page never 500s if the
 * pricing-rules lookup itself fails (DB unreachable). It is used solely inside
 * `getLivePublicFee`'s catch path; no surface should read it as the fee in
 * normal operation. Keep it in sync with the AU/AUD launch baseline so a lookup
 * failure degrades to the right number.
 *
 * Launch baseline (founder, 2026-06-08): 2% + AUD 0.50 per paid ticket, written
 * to `pricing_rules` by migration 20260608000003_platform_fee_au_launch_default.
 *   platform_fee_percentage = 2.0
 *   platform_fee_fixed      = 50 (cents) = AUD 0.50
 */
export const PUBLIC_PLATFORM_FEE = {
  percent: 2,
  fixedCents: 50,
  currency: 'AUD',
} as const

/** e.g. "2%" */
export const PUBLIC_FEE_PERCENT_LABEL = `${PUBLIC_PLATFORM_FEE.percent}%`

/** e.g. "AUD 0.50" */
export const PUBLIC_FEE_FIXED_LABEL = `${PUBLIC_PLATFORM_FEE.currency} ${(
  PUBLIC_PLATFORM_FEE.fixedCents / 100
).toFixed(2)}`

/** e.g. "2% + AUD 0.50" - the single definite public fee statement */
export const PUBLIC_FEE_LABEL = `${PUBLIC_FEE_PERCENT_LABEL} + ${PUBLIC_FEE_FIXED_LABEL}`
