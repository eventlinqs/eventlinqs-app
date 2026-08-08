/**
 * Can this event actually sell a ticket?
 *
 * THE DEFECT. `lineup-loop-proof-night-3z7osn` is published, advertises
 * "Get tickets. From AUD $25. Secure checkout" in its hero, and cannot sell
 * anything: both its tiers have `total_capacity = 0`, so the picker computes
 * `available = 0 - 0 - 0` and renders every tier as sold out. The founder hit
 * this and diagnosed it as a Stripe problem; it has nothing to do with Stripe.
 * Nothing in the publish path ever asked whether there was inventory.
 *
 * SEATED EVENTS ARE DIFFERENT AND THE GUARD MUST NOT TOUCH THEM. Measured on
 * TEST, 5 of 28 seated events carry zero tier capacity and sell perfectly well,
 * because a seated event's inventory is the seat map and the tier is a price
 * band. Blocking those would have broken seated ticketing outright, so the
 * guard applies to general-admission events only.
 *
 * Pure, so it is fully unit-tested without a database.
 */

export type SellableTier = {
  name?: string | null
  total_capacity?: number | null
  is_active?: boolean | null
}

export type SellableCheck = { ok: true } | { ok: false; message: string }

/** A tier the buyer can actually be offered. */
function isOffered(tier: SellableTier): boolean {
  return tier.is_active !== false
}

/**
 * @param tiers the event's ticket tiers
 * @param opts.hasReservedSeating true when the seat map, not the tier, holds
 *   the inventory. Capacity is not checked in that case.
 */
export function checkSellable(
  tiers: SellableTier[],
  opts: { hasReservedSeating?: boolean } = {},
): SellableCheck {
  const offered = (tiers ?? []).filter(isOffered)

  if (offered.length === 0) {
    return {
      ok: false,
      message:
        'Add at least one ticket type before publishing. Right now this event would go live with nothing to buy.',
    }
  }

  // A tier with no name renders as a blank line above a price, which reads as
  // a broken row rather than a ticket.
  const unnamed = offered.filter((t) => !t.name || !String(t.name).trim())
  if (unnamed.length > 0) {
    return {
      ok: false,
      message:
        unnamed.length === 1
          ? 'One of your ticket types has no name. Give it a name so buyers know what they are choosing.'
          : `${unnamed.length} of your ticket types have no name. Give each one a name so buyers know what they are choosing.`,
    }
  }

  // The seat map is the inventory for a seated event, so tier capacity is not
  // the question there.
  if (opts.hasReservedSeating) return { ok: true }

  const totalCapacity = offered.reduce((sum, t) => sum + (t.total_capacity ?? 0), 0)
  if (totalCapacity <= 0) {
    return {
      ok: false,
      message:
        'Set how many tickets are available before publishing. With a capacity of zero every ticket type shows as sold out and nobody can buy.',
    }
  }

  return { ok: true }
}
