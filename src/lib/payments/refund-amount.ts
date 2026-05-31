/**
 * Allocates the gross refund amount for a by-ticket refund: the order's gross
 * total apportioned by the selected tickets' face value. Because the gross
 * total already contains fees and inclusive GST, allocating proportionally to
 * face value returns those proportionally too - no separate tax-line movement.
 *
 * This mirrors the SQL formula in create_refund_request so the UI preview and
 * the authoritative server-side amount stay in step (proven by unit test).
 */
export function allocateRefundAmountCents(args: {
  totalCents: number
  selectedFaceCents: number
  allFaceCents: number
}): number {
  const { totalCents, selectedFaceCents, allFaceCents } = args
  if (allFaceCents <= 0) throw new Error('allFaceCents must be positive')
  return Math.round((totalCents * selectedFaceCents) / allFaceCents)
}
