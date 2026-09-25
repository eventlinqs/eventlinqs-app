/**
 * THE STRIPE CONNECT COUNTRY-TO-CURRENCY MAP, AND NOTHING ELSE.
 *
 * ============================================================================
 * WHY THIS IS A MODULE OF ITS OWN, AND WHY IT IMPORTS NOTHING
 * ============================================================================
 *
 * This table used to live in `application-fee.ts`, beside the fee composition
 * it has no part in. That was harmless on the server and expensive in the
 * browser, because `src/components/checkout/ticket-selector.tsx` is a client
 * component and it imports `describeSaleRefusal` from `sale-status.ts`, which
 * took exactly one thing from the fee resolver: this function.
 *
 * One import, and the bundler had to follow it:
 *
 *     ticket-selector.tsx (client)
 *       -> sale-status.ts          (for describeSaleRefusal, pure copy)
 *       -> application-fee.ts      (for getCurrencyForCountry, this table)
 *       -> pricing-rules.ts
 *       -> src/lib/redis/client.ts
 *       -> @upstash/redis          + a 16.0 KB Node Buffer polyfill
 *
 * 17.5 KB gzip of server-only code, shipped to every buyer, on /events/[slug],
 * /events/[slug]/holder and /e/[code]: the event page and the checkout, which
 * are the two surfaces that sell tickets. It put all three over the Scope v5
 * 10.3 budget of 200 KB by 372 bytes, so the overage was 48 times smaller than
 * the thing causing it. Registered in perf-budget.json on 15 September 2026 and
 * traced by lane C, which could not make the fix because src/lib/payments is
 * lane A's slice (BORDER, C:/dev/REVIEW-QUEUE-C.md, 17 September 2026).
 *
 * So this module has NO IMPORTS, deliberately, and it must never gain one. It
 * is a leaf, and being a leaf is its whole job: a single `import type` would be
 * free, but a single value import would put the chain back and the 17.5 KB with
 * it. `application-fee.ts` re-exports both members, so no existing caller
 * changed and none needed to.
 *
 * WHAT THIS IS NOT. It is not pricing policy and it never becomes any. The
 * country-to-currency pairing is STRUCTURAL: Stripe Connect supports a fixed
 * list of country/currency pairs and this records that list. Per-country
 * pricing values live in `pricing_rules` and are read through
 * `getPricingRule`, which is the one resolver the constitution's Fee system
 * section names. Nothing here decides what anybody is charged.
 */

/**
 * Currency that EventLinqs charges in for a given Stripe Connect country.
 *
 * The country-to-currency map is structural (Stripe Connect supports a fixed
 * list of country/currency pairs), not pricing policy. It stays in code; per-
 * country pricing values live in pricing_rules.
 */
export const CONNECT_CURRENCY_MAP: Record<string, string> = {
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

export function getCurrencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null
  return CONNECT_CURRENCY_MAP[country.toUpperCase()] ?? null
}
