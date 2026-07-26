import { describe, expect, it } from 'vitest'
import { contiguousGroupWindow, type BASeat } from '@/lib/seating/best-available'

function rowOf(n: number, taken: number[] = []): BASeat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    section_id: 'sec',
    row_label: 'A',
    seat_number: String(i + 1),
    x: 100 + i * 24,
    y: 100,
    status: taken.includes(i + 1) ? 'sold' : 'available',
    seat_type: 'standard',
  }))
}

describe('contiguousGroupWindow (item 12)', () => {
  it('centres the group on the tapped seat', () => {
    const ids = contiguousGroupWindow(rowOf(9), 's5', 3)
    expect(ids).toEqual(['s4', 's5', 's6'])
  })

  it('slides the window when the tap sits at the row edge', () => {
    expect(contiguousGroupWindow(rowOf(9), 's1', 3)).toEqual(['s1', 's2', 's3'])
    expect(contiguousGroupWindow(rowOf(9), 's9', 3)).toEqual(['s7', 's8', 's9'])
  })

  it('prefers the orphan-safe window over the centred one', () => {
    // Run of 4 open seats (2..5); a centred pair on s3 would leave s2
    // stranded, so the pair slides to keep zero or two on each side.
    const seats = rowOf(6, [1, 6])
    const ids = contiguousGroupWindow(seats, 's3', 2)
    expect(ids).toEqual(['s2', 's3'])
  })

  it('never crosses a sold seat', () => {
    const ids = contiguousGroupWindow(rowOf(9, [4]), 's3', 3)
    expect(ids).toEqual(['s1', 's2', 's3'])
  })

  it('answers null when the run cannot hold the group', () => {
    expect(contiguousGroupWindow(rowOf(9, [3, 7]), 's5', 4)).toBeNull()
    expect(contiguousGroupWindow(rowOf(9, [5]), 's5', 2)).toBeNull()
  })

  it('never crosses an aisle: the gap splits the run', () => {
    const seats = rowOf(8)
    // Punch an aisle between 4 and 5 (double pitch plus a bit).
    for (const s of seats) {
      if (Number(s.seat_number) >= 5) s.x += 40
    }
    expect(contiguousGroupWindow(seats, 's4', 3)).toEqual(['s2', 's3', 's4'])
    expect(contiguousGroupWindow(seats, 's4', 5)).toBeNull()
  })
})
