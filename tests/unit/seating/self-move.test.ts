import { describe, it, expect } from 'vitest'
import { guardedDestinations, type SelfMoveSeat } from '@/lib/seating/self-move'

/**
 * F31/F32: the self-move orphan guard. Only same-tier seats whose
 * occupation (after the mover's seat is vacated) strands nobody are ever
 * offered, so a self-move can never strand a lone seat.
 */

function seat(
  id: string,
  n: number,
  status = 'available',
  tier: string | null = 'tier-a',
  row = 'A',
): SelfMoveSeat {
  return {
    id,
    row_label: row,
    seat_number: String(n),
    seat_type: 'standard',
    status,
    x: n * 24,
    y: row === 'A' ? 100 : 126,
    seat_map_section_id: 'stalls',
    ticket_tier_id: tier,
  }
}

describe('self-move orphan guard (F31/F32)', () => {
  it('withholds a destination that would strand a single', () => {
    // Row A: [sold(me)=1] [open 2] [open 3] [sold 4] ... taking seat 3
    // after vacating seat 1 strands seat 2 between my old open seat? No:
    // vacating 1 makes 1-2 a pair. Build the classic strand instead:
    // [me=1 sold] [sold 2] [open 3] [open 4] [sold 5]: taking 4 strands 3.
    const room = [
      seat('s1', 1, 'sold'),
      seat('s2', 2, 'sold'),
      seat('s3', 3),
      seat('s4', 4),
      seat('s5', 5, 'sold'),
      // a clean pair elsewhere so safe options exist
      seat('s7', 7),
      seat('s8', 8),
      seat('s9', 9),
    ]
    const { safe, guardedCount } = guardedDestinations(room, 's1')
    const safeIds = safe.map(s => s.id)
    // Taking s4 would strand s3 (s2 sold, my vacated s1 is not adjacent).
    expect(safeIds).not.toContain('s4')
    expect(safeIds).not.toContain('s3') // taking s3 strands s4 symmetrically
    expect(guardedCount).toBeGreaterThanOrEqual(2)
    // The middle of the open triple is guarded (strands both sides is
    // false: taking s8 leaves s7 and s9 both singles) - taking an END of
    // the triple is safe (leaves a pair).
    expect(safeIds).toContain('s7')
    expect(safeIds).toContain('s9')
    expect(safeIds).not.toContain('s8')
  })

  it('the vacated seat counts as open, so moving beside it is honest', () => {
    // [me=1 sold] [open 2] [sold 3] ... moving to 2 leaves my vacated 1
    // beside it as a pair: no strand, allowed.
    const room = [
      seat('s1', 1, 'sold'),
      seat('s2', 2),
      seat('s3', 3, 'sold'),
    ]
    const { safe } = guardedDestinations(room, 's1')
    expect(safe.map(s => s.id)).toContain('s2')
  })

  it('only same-tier seats are offered (price parity, money never moves)', () => {
    const room = [
      seat('s1', 1, 'sold', 'tier-a'),
      seat('s2', 2, 'available', 'tier-a'),
      seat('s3', 3, 'available', 'tier-b'),
      seat('s4', 4, 'available', 'tier-a'),
    ]
    const { safe } = guardedDestinations(room, 's1')
    const ids = safe.map(s => s.id)
    expect(ids).toContain('s2')
    expect(ids).not.toContain('s3')
  })

  it('sold and held seats are never destinations', () => {
    const room = [
      seat('s1', 1, 'sold'),
      seat('s2', 2, 'held'),
      seat('s3', 3, 'reserved'),
      seat('s4', 4),
      seat('s5', 5),
    ]
    const { safe } = guardedDestinations(room, 's1')
    const ids = safe.map(s => s.id)
    expect(ids).not.toContain('s2')
    expect(ids).not.toContain('s3')
  })
})
