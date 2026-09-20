/**
 * WHERE THE DISCOVERY QUESTION IS ASKED: THE PURE HALF.
 *
 * Client safe on purpose. The ticket page is a client component and needs the
 * placement value and its type; importing them from the server resolver would
 * drag the admin client, the paged reader and Sentry into the first load of
 * every event page, which is the exact shape lane A spent 18 September taking
 * back out of the shared shell.
 *
 * No database, no environment, no I/O. Everything here is a function of values
 * the caller already holds, which is also why the conversion measurement can be
 * tested exhaustively without a database.
 */

/**
 * The two places the question can be asked. AQ1 names both: the capture sits at
 * checkout, and the reversal "moves the capture off checkout, it does not remove
 * it", so removing it is deliberately not one of the values. Switching the
 * question off entirely is a different decision and already has its own switch,
 * the `audience_capture` flag.
 */
export const CAPTURE_PLACEMENTS = ['checkout', 'ticket_page'] as const
export type CapturePlacement = (typeof CAPTURE_PLACEMENTS)[number]

/** The placement the platform has always used, and the last resort on failure. */
export const DEFAULT_CAPTURE_PLACEMENT: CapturePlacement = 'checkout'

export function isCapturePlacement(value: unknown): value is CapturePlacement {
  return typeof value === 'string' && (CAPTURE_PLACEMENTS as readonly string[]).includes(value)
}

/** A stretch of time during which one placement was in force. */
export interface PlacementPeriod {
  placement: CapturePlacement
  /** Inclusive. ISO 8601. */
  from: string
  /** Exclusive. Null means "still in force". ISO 8601. */
  until: string | null
}

export interface PlacementDecisionLike {
  placement: CapturePlacement
  effectiveFrom: string
}

/**
 * The decision log turned into periods.
 *
 * Decisions are points; a reservation is created at a moment and has to be
 * attributed to whatever was in force then, so the points become half open
 * intervals. Two decisions at the same instant would make that attribution
 * undecidable, which is why the table carries a unique constraint on
 * effective_from rather than leaving it to whoever writes the next one.
 *
 * Consecutive decisions repeating the SAME placement are merged. A reversal
 * that is reversed back leaves three rows in the log and two genuine periods,
 * and a measurement that counted them as three would split a rate into slivers
 * and then report that there was not enough evidence for any of them.
 */
export function placementPeriodsFrom(decisions: PlacementDecisionLike[]): PlacementPeriod[] {
  const sorted = [...decisions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  const periods: PlacementPeriod[] = []
  for (const decision of sorted) {
    const open = periods[periods.length - 1]
    if (open && open.placement === decision.placement) continue
    if (open) open.until = decision.effectiveFrom
    periods.push({ placement: decision.placement, from: decision.effectiveFrom, until: null })
  }
  return periods
}

/**
 * Which placement was in force at an instant, or null for before the first
 * decision. Null is a real answer and not a failure: reservations created
 * before the question was ever asked are the "before" half of AQ1's
 * measurement, and calling them checkout would erase the comparison.
 */
export function placementInForceAt(
  periods: PlacementPeriod[],
  at: string,
): CapturePlacement | null {
  for (const period of periods) {
    if (at < period.from) continue
    if (period.until === null || at < period.until) return period.placement
  }
  return null
}
