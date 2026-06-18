/**
 * Single-source checkout pricing rules (FUN-01 / FUN-03).
 *
 * The displayed total (checkout page server render) and the charged total
 * (processCheckout / processSeatCheckout) must resolve every unit price the
 * SAME way, or the buyer sees one number and is charged another. Both paths
 * import these helpers so the rule lives in exactly one place.
 *
 * The rule: a tier's dynamic price (when an active dynamic-pricing rule
 * resolves one) overrides its base price; otherwise the base price stands.
 * Pure and unit-testable - no DB, no network.
 */

/**
 * GA per-tier unit price: dynamic overrides base, base overrides nothing (0).
 * Mirrors exactly what both the checkout page (display) and processCheckout
 * (charge) now call.
 */
export function pickUnitPriceCents(
  dynamicCents: number | null | undefined,
  baseCents: number | null | undefined,
): number {
  return dynamicCents ?? baseCents ?? 0
}

/**
 * Seat per-seat unit price, single-sourced for display + charge. A seat bound
 * to a tier is priced by that tier's current (dynamic-aware) price via the
 * injected `currentTierPriceCents` resolver (`get_current_tier_price`),
 * falling back to the seat's own `price_cents` then the event fallback. A seat
 * with no tier uses its own price then the fallback. The resolver is injected
 * so this stays pure and both call sites share identical fallback ordering.
 */
export async function resolveSeatUnitPriceCents(
  seat: { ticket_tier_id: string | null; price_cents: number | null },
  currentTierPriceCents: (tierId: string) => Promise<number | null>,
  fallbackPriceCents: number,
): Promise<number> {
  if (seat.ticket_tier_id) {
    const dynamic = await currentTierPriceCents(seat.ticket_tier_id)
    return dynamic ?? seat.price_cents ?? fallbackPriceCents
  }
  return seat.price_cents ?? fallbackPriceCents
}
