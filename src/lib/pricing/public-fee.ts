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
 * Launch baseline (founder, LOCKED 2026, docs/EventLinqs-Fee-Structure-LOCKED.md):
 * the SERVICE fee 3.5% + AUD 0.99 per paid ticket, written to `pricing_rules`
 * by migration 20260627000001_fee_structure_locked_au.
 *   platform_fee_percentage = 3.5
 *   platform_fee_fixed      = 99 (cents) = AUD 0.99
 *
 * ONE-FEE-ALLOW-BEGIN: names the deleted constant so its removal is auditable.
 * ONE FEE, founder ruling 15 August 2026. There is no second constant here
 * because there is no second fee: card processing is paid out of the 3.5, not
 * charged as a line of its own. A `PUBLIC_PROCESSING_FEE` fallback of 2.5% used
 * to sit below this one; it was DELETED rather than zeroed, because a fallback
 * constant is read exactly when the database cannot be, and a stale one would
 * reintroduce the deleted fee at the precise moment nothing could contradict it.
 * ONE-FEE-ALLOW-END
 */
export const PUBLIC_PLATFORM_FEE = {
  percent: 3.5,
  fixedCents: 99,
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
