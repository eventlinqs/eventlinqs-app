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
 * Public platform fee fallback (founder intent 2026-06-08): 2% + AUD 0.50 per
 * paid ticket.
 *   platform_fee_percentage = 2.0
 *   platform_fee_fixed      = 50 (cents) = AUD 0.50
 *
 * IMPORTANT - this constant is now only a SAFE FALLBACK, not the displayed
 * number. `/pricing` and `/organisers` read the LIVE `pricing_rules` value at
 * request time via `getLivePublicFee()` (`src/lib/pricing/live-fee.ts`), so the
 * displayed fee always equals the charged fee regardless of this constant. The
 * live AU/AUD baseline is currently `platform_fee_percentage 2.5` (see
 * docs/benchmark/system-pass/ADMIN-HANDOVER.md); lowering it to the 2% founder
 * intent is a single-field change in /admin/pricing (no migration, no deploy) -
 * both the display and the charge follow the one DB source automatically.
 * Keep this fallback in sync with that baseline whenever it changes so a
 * pricing-rules lookup failure degrades to the right number.
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
