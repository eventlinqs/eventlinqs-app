import { z } from 'zod'

/**
 * Reservation input validation - shared, pure, and unit-testable.
 *
 * Lives outside the `'use server'` action file so the schema and the
 * quantity-limit logic can be imported directly by tests (a `'use server'`
 * module may only export async functions).
 *
 * RES-01: the per-order quantity limit is the organiser's per-tier
 * `max_per_order`, NOT a magic constant. The Zod `quantity` bound is only a
 * coarse abuse ceiling so an absurd payload (e.g. 1e9) never reaches the DB;
 * the authoritative business limit is enforced against each tier's real
 * `max_per_order` in `checkMaxPerOrder`. Previously the schema hard-capped
 * quantity at 20 while the client stepper clamps to `max_per_order` (DB
 * default 10, no upper bound), so any tier with `max_per_order > 20` turned a
 * legitimate selection into "Invalid reservation data".
 */
export const MAX_QTY_HARD_CAP = 100

export const ReservationItemSchema = z.object({
  ticket_tier_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QTY_HARD_CAP),
})

export const AddonItemSchema = z.object({
  addon_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QTY_HARD_CAP),
})

export const CreateReservationSchema = z.object({
  event_id: z.string().uuid(),
  ticket_items: z.array(ReservationItemSchema).min(1),
  addon_items: z.array(AddonItemSchema).default([]),
})

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>

export interface TierOrderLimit {
  id: string
  name: string | null
  max_per_order: number | null
}

/**
 * RES-01 authoritative per-order limit check. For each requested ticket item,
 * reject when the quantity exceeds that tier's `max_per_order`. A tier we did
 * not load (unknown id) is left for the DB RPC to reject; a null limit means
 * "no explicit cap" and is skipped. Returns a precise, buyer-facing message
 * naming the tier and its limit so the failure is never the opaque
 * "Invalid reservation data".
 */
export function checkMaxPerOrder(
  items: { ticket_tier_id: string; quantity: number }[],
  tiers: TierOrderLimit[],
): { ok: true } | { ok: false; error: string } {
  const byId = new Map(tiers.map((t) => [t.id, t]))
  for (const item of items) {
    const tier = byId.get(item.ticket_tier_id)
    if (!tier) continue
    const max = tier.max_per_order
    if (max != null && item.quantity > max) {
      const label = tier.name ?? 'ticket'
      return {
        ok: false,
        error: `You can buy at most ${max} ${label} per order.`,
      }
    }
  }
  return { ok: true }
}

/**
 * RES-02: compact, log-safe summary of Zod issues so a future
 * invalid-reservation failure names the offending field(s) and codes in the
 * server log instead of vanishing behind the generic user-facing string.
 */
export function summariseIssues(
  issues: readonly { path: PropertyKey[]; code: string; message: string }[],
): string {
  return issues
    .map(
      (i) =>
        `${i.path.map((p) => String(p)).join('.') || '(root)'}: ${i.code} - ${i.message}`,
    )
    .join('; ')
}
