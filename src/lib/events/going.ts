/**
 * Honest "going" social proof from REAL confirmed ticket sales.
 *
 * This is engine 4 of the demand engine (conversion + social proof). The
 * count is never fabricated, inflated, or estimated: it is the genuine
 * number of tickets actually sold for the event (the buyer completed
 * checkout and paid), which equals the number of people going. The input
 * is the already-loaded EventInventory.total_sold, which sums sold_count
 * (paid) across active tiers and is distinct from reserved_count (held but
 * not yet paid). Reserved holds are NOT counted as going.
 *
 * Below a sensible floor we show nothing rather than a weak number, so a
 * thinly sold event never advertises "2 going". The floor matches the
 * platform's existing 10-ticket scarcity boundary (few_left / only_x_left).
 */

export const GOING_THRESHOLD = 10

/**
 * Resolve the honest going count to display, or null to render nothing.
 *
 * @param totalSold genuine confirmed (paid) ticket sales for the event
 *                  (EventInventory.total_sold). Reserved holds excluded.
 * @returns the count to show when it meets the floor, otherwise null.
 */
export function resolveGoingCount(totalSold: number): number | null {
  if (!Number.isFinite(totalSold)) return null
  const sold = Math.floor(totalSold)
  if (sold < GOING_THRESHOLD) return null
  return sold
}

/**
 * Format the going count as accessible social-proof copy. Australian
 * English, no em/en dashes, no exclamation marks. Always grammatical
 * (the count is always >= the floor, so it is always plural here, but the
 * singular branch is kept correct for safety).
 */
export function formatGoingLabel(count: number): string {
  const people = count.toLocaleString('en-AU')
  return `${people} ${count === 1 ? 'person' : 'people'} going`
}
