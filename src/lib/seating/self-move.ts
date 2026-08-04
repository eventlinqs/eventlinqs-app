/**
 * The self-move orphan guard, pure: given the live room and the mover's
 * current seat, the destinations offered are available seats on the SAME
 * tier whose occupation, after the current seat is vacated, strands
 * nobody. Runs twice by design: once to build the offered list, and again
 * server-side at move time so a tampered client can never strand a seat.
 */

import { findStrandedOrphans, type BASeat } from './best-available'

export interface SelfMoveSeat {
  id: string
  row_label: string
  seat_number: string
  seat_type: string
  status: string
  x: number
  y: number
  seat_map_section_id: string | null
  ticket_tier_id: string | null
}

export function guardedDestinations(
  allSeats: SelfMoveSeat[],
  currentSeatId: string,
): { safe: SelfMoveSeat[]; guardedCount: number } {
  const current = allSeats.find(s => s.id === currentSeatId)
  const toBA = (vacate: boolean) =>
    allSeats.map<BASeat>(s => ({
      id: s.id,
      section_id: s.seat_map_section_id,
      row_label: s.row_label,
      seat_number: s.seat_number,
      x: Number(s.x),
      y: Number(s.y),
      status: vacate && s.id === currentSeatId ? 'available' : s.status,
      seat_type: s.seat_type,
    }))

  // Baseline: the room BEFORE the move. A destination is guarded only when
  // it creates a strand the room did not already have; the mover's own
  // vacated seat is excluded, because no destination choice can change
  // what vacating leaves behind (and an adjacent destination that keeps
  // the vacated seat paired is naturally favoured by that rule).
  const beforeIds = new Set(findStrandedOrphans(toBA(false), new Set()).map(s => s.id))
  const afterVacate = toBA(true)

  const candidates = allSeats.filter(
    s =>
      s.status === 'available' &&
      s.id !== currentSeatId &&
      (current?.ticket_tier_id == null || s.ticket_tier_id === current.ticket_tier_id),
  )

  const safe: SelfMoveSeat[] = []
  let guardedCount = 0
  for (const candidate of candidates) {
    const newStrands = findStrandedOrphans(afterVacate, new Set([candidate.id])).filter(
      s => !beforeIds.has(s.id) && s.id !== currentSeatId,
    )
    if (newStrands.length === 0) safe.push(candidate)
    else guardedCount += 1
  }
  return { safe, guardedCount }
}
