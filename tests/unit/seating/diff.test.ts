import { describe, it, expect } from 'vitest'
import { diffChartAgainstLive, type LiveSeatForDiff } from '@/lib/seating/diff'

/**
 * F27/F28: the read-only preview of a chart sync mirrors the additive
 * RPC's semantics exactly: adds, moves, removals of never-sold seats
 * only, and hard protection for reserved, sold and held inventory.
 */

function live(
  row: string,
  n: number,
  status = 'available',
  x = n * 24,
  y = 100,
): LiveSeatForDiff {
  return {
    section_name: 'Stalls',
    row_label: row,
    seat_number: String(n),
    status,
    seat_type: 'standard',
    x,
    y,
  }
}

function layoutWith(
  seats: { row: string; n: number; x?: number; y?: number; blocked?: boolean }[],
) {
  const rows = new Map<string, { number: string; x: number; y: number; blocked?: boolean }[]>()
  for (const s of seats) {
    const list = rows.get(s.row) ?? []
    list.push({ number: String(s.n), x: s.x ?? s.n * 24, y: s.y ?? 100, blocked: s.blocked })
    rows.set(s.row, list)
  }
  return {
    sections: [
      {
        name: 'Stalls',
        rows: [...rows.entries()].map(([label, seats]) => ({ label, seats })),
      },
    ],
  }
}

describe('chart-versus-live diff (F27/F28)', () => {
  it('a new layout seat is an addition', () => {
    const diff = diffChartAgainstLive(
      layoutWith([{ row: 'A', n: 1 }, { row: 'A', n: 2 }]),
      [live('A', 1)],
    )
    expect(diff.added).toEqual([{ section: 'Stalls', row: 'A', number: '2' }])
    expect(diff.removed).toHaveLength(0)
    expect(diff.unchanged).toBe(1)
  })

  it('a repositioned free seat is a move; an untouched one is unchanged', () => {
    const diff = diffChartAgainstLive(
      layoutWith([{ row: 'A', n: 1, x: 48 }, { row: 'A', n: 2 }]),
      [live('A', 1), live('A', 2)],
    )
    expect(diff.moved).toEqual([{ section: 'Stalls', row: 'A', number: '1' }])
    expect(diff.unchanged).toBe(1)
  })

  it('an available seat gone from the layout is removed; a SOLD one is kept and listed as protected', () => {
    const diff = diffChartAgainstLive(layoutWith([{ row: 'A', n: 1 }]), [
      live('A', 1),
      live('A', 2, 'available'),
      live('A', 3, 'sold'),
    ])
    expect(diff.removed).toEqual([{ section: 'Stalls', row: 'A', number: '2' }])
    expect(diff.protectedMissing).toEqual([
      { section: 'Stalls', row: 'A', number: '3', status: 'sold' },
    ])
  })

  it('sold, reserved and held seats matched by the layout are protected, never moves', () => {
    const diff = diffChartAgainstLive(
      layoutWith([
        { row: 'A', n: 1, x: 999 },
        { row: 'A', n: 2, x: 999 },
        { row: 'A', n: 3, x: 999 },
      ]),
      [live('A', 1, 'sold'), live('A', 2, 'reserved'), live('A', 3, 'held')],
    )
    expect(diff.moved).toHaveLength(0)
    expect(diff.protectedSeats.map(p => p.status).sort()).toEqual(['held', 'reserved', 'sold'])
  })

  it('a block toggle counts as a move (status follows the chart on free seats)', () => {
    const diff = diffChartAgainstLive(
      layoutWith([{ row: 'A', n: 1, blocked: true }]),
      [live('A', 1, 'available')],
    )
    expect(diff.moved).toHaveLength(1)
  })

  it('an identical room diffs to nothing but unchanged', () => {
    const diff = diffChartAgainstLive(
      layoutWith([{ row: 'A', n: 1 }, { row: 'A', n: 2 }]),
      [live('A', 1), live('A', 2)],
    )
    expect(diff.added).toHaveLength(0)
    expect(diff.moved).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.protectedSeats).toHaveLength(0)
    expect(diff.unchanged).toBe(2)
  })
})
