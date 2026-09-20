/**
 * HOW MANY SEATS, AND IN WHAT STATE, ANSWERED BY THE DATABASE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS RATHER THAN A `.select()` AT EACH CALL SITE.
 *
 * Three organiser surfaces ask a version of "how many seats are sold", and the
 * one that mattered most was answered by reading one row per sold seat and
 * counting the rows in JavaScript:
 *
 *     .from('seats').select('event_id').in('event_id', ids).eq('status','sold')
 *
 * Supabase caps a response at 1,000 rows in silence: HTTP 200, `error` null, a
 * full-looking array (https://supabase.com/docs/reference/javascript/select,
 * fetched 2026-09-19). The cap is on the RESPONSE, so that ceiling was shared
 * across every reserved-seating event in the list at once, and it reached the
 * organiser as "{sold} / {capacity}" on My Events.
 *
 * A count the DATABASE performs cannot be truncated, which is the whole reason
 * this goes through `event_seat_status_counts_many` (migration
 * 20260920000020) instead of through a read. PostgREST cannot GROUP BY, so
 * there is no third option.
 *
 * ---------------------------------------------------------------------------
 * WHY IT THROWS INSTEAD OF RETURNING ZERO.
 *
 * The code this replaces discarded the error, so a read that FAILED rendered
 * as nought sold for every event. Nought sold and could-not-be-read are
 * different facts and an organiser is entitled to know which one they are
 * looking at. Every failure here throws; the caller decides what to show, and
 * the events list shows a dash.
 */

/**
 * Structural on purpose, for the same TS2589 reason delete-eligibility.ts
 * gives: naming the generated SupabaseClient here makes the type instantiation
 * for this module explode.
 */
export interface SeatCountRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/**
 * One event's seats, per `seat_status`, plus the total.
 *
 * `byStatus` carries every label the enum holds, including the ones with no
 * rows, because the function returns them all. A status added to `seat_status`
 * later appears here with no edit to this file.
 */
export interface SeatStatusCounts {
  byStatus: Record<string, number>
  total: number
}

/** Seats that are spoken for: an organiser cannot re-sell any of these. */
export const PROTECTED_SEAT_STATUSES = ['reserved', 'sold', 'held'] as const

function nonNegativeInteger(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${what} is not a count: ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Read one event's counts out of the function's JSON.
 *
 * `total` is asserted to equal the sum of the statuses rather than trusted,
 * because the two are computed in the same loop and a disagreement between
 * them would mean the loop had missed a label. That is exactly the kind of
 * silent shortfall this module exists to end, so it is refused here rather
 * than rendered.
 */
export function seatCountsFromRpc(raw: unknown): SeatStatusCounts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`event_seat_status_counts returned no object: ${JSON.stringify(raw)}`)
  }
  const entries = Object.entries(raw as Record<string, unknown>)
  const byStatus: Record<string, number> = {}
  let summed = 0
  let total: number | null = null
  for (const [key, value] of entries) {
    const n = nonNegativeInteger(value, `event_seat_status_counts.${key}`)
    if (key === 'total') {
      total = n
      continue
    }
    byStatus[key] = n
    summed += n
  }
  if (total === null) throw new Error('event_seat_status_counts returned no total')
  if (total !== summed) {
    throw new Error(`event_seat_status_counts total ${total} does not equal the sum of its statuses ${summed}`)
  }
  return { byStatus, total }
}

/** Seats in one of the named statuses. An unknown status contributes nothing. */
export function countIn(counts: SeatStatusCounts, statuses: readonly string[]): number {
  return statuses.reduce((n, s) => n + (counts.byStatus[s] ?? 0), 0)
}

/** Seats an organiser cannot sell again. */
export function protectedSeats(counts: SeatStatusCounts): number {
  return countIn(counts, PROTECTED_SEAT_STATUSES)
}

/** One event's seat counts. Throws rather than guessing. */
export async function readSeatStatusCounts(
  client: SeatCountRpcClient,
  eventId: string,
): Promise<SeatStatusCounts> {
  const { data, error } = await client.rpc('event_seat_status_counts', { p_event_id: eventId })
  if (error) throw new Error(`event_seat_status_counts failed: ${error.message}`)
  return seatCountsFromRpc(data)
}

/**
 * Many events' seat counts in one round trip, keyed by event id.
 *
 * An id the function did not answer for is ABSENT from the map, never zero.
 * The caller must be able to tell "this event has no seats" from "this event
 * was not in the answer", because the first is a fact and the second is a
 * fault.
 */
export async function readSeatStatusCountsMany(
  client: SeatCountRpcClient,
  eventIds: readonly string[],
): Promise<Map<string, SeatStatusCounts>> {
  const out = new Map<string, SeatStatusCounts>()
  if (eventIds.length === 0) return out
  const { data, error } = await client.rpc('event_seat_status_counts_many', { p_event_ids: [...eventIds] })
  if (error) throw new Error(`event_seat_status_counts_many failed: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('event_seat_status_counts_many returned no object')
  }
  for (const [id, counts] of Object.entries(data as Record<string, unknown>)) {
    out.set(id, seatCountsFromRpc(counts))
  }
  return out
}
