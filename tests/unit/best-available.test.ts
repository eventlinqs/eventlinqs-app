import { describe, expect, it } from 'vitest'

import {
  pickBestAvailable,
  resolveFocalPoint,
  type BASeat,
} from '@/lib/seating/best-available'

/**
 * S1: the server-side best-available cascade. Geometry mirrors the real
 * generator: seat spacing 24, row spacing 26, seat size 20. The focal point
 * sits at the top centre (the stage), so "best" means closest to the stage.
 */

function seat(
  id: string,
  row: string,
  num: number,
  x: number,
  y: number,
  overrides: Partial<BASeat> = {},
): BASeat {
  return {
    id,
    section_id: 'sec-1',
    row_label: row,
    seat_number: String(num),
    x,
    y,
    status: 'available',
    seat_type: 'standard',
    ...overrides,
  }
}

/** rows x cols grid, row A nearest the stage (y grows away from it). */
function grid(rows: number, cols: number): BASeat[] {
  const out: BASeat[] = []
  for (let r = 0; r < rows; r++) {
    const label = String.fromCharCode(65 + r)
    for (let c = 0; c < cols; c++) {
      out.push(seat(`${label}${c + 1}`, label, c + 1, c * 24, r * 26))
    }
  }
  return out
}

const FOCAL = { x: ((8 - 1) * 24) / 2, y: -40 } // top centre of an 8-wide grid

describe('the contiguous leg', () => {
  it('picks a front-row contiguous window nearest the focal point', () => {
    const result = pickBestAvailable({ seats: grid(4, 8), quantity: 3, focal: FOCAL })
    expect(result.strategy).toBe('contiguous')
    const rows = new Set(result.seatIds.map(id => id[0]))
    expect(rows).toEqual(new Set(['A']))
    // The window is centred on the focal: seats 3, 4, 5 of row A.
    expect(result.seatIds.sort()).toEqual(['A3', 'A4', 'A5'])
  })

  it('shifts the window rather than strand a single seat', () => {
    // Row A of 8, party of 3, focal centred: the naive best window 3..5
    // would... actually leaves {1,2} and {6,7,8}, both fine. Sell seats to
    // craft the trap: 1,2 sold and 6 sold. Runs: [3,4,5] and [7,8]. Party
    // of 2 in run [3,4,5]: window 3,4 leaves {5} alone (refused), window
    // 4,5 leaves {3} alone (refused), so the admissible pick is run [7,8].
    const seats = grid(1, 8).map(s =>
      ['A1', 'A2', 'A6'].includes(s.id) ? { ...s, status: 'sold' } : s,
    )
    const result = pickBestAvailable({ seats, quantity: 2, focal: FOCAL })
    expect(result.strategy).toBe('contiguous')
    expect(result.seatIds.sort()).toEqual(['A7', 'A8'])
  })

  it('degrades to contiguous-with-orphan when every window strands one', () => {
    // A 6-seat run, party of 5: every placement leaves exactly one orphan.
    const seats = grid(1, 8).map(s =>
      ['A1', 'A2'].includes(s.id) ? { ...s, status: 'sold' } : s,
    )
    const result = pickBestAvailable({ seats, quantity: 5, focal: FOCAL })
    expect(result.strategy).toBe('contiguous-with-orphan')
    expect(result.seatIds).toHaveLength(5)
  })

  it('a pick flush to the run end leaves no orphan and stays contiguous', () => {
    // 6-seat run, party of 4: window 3..6 leaves {7,8} (two seats, fine).
    const seats = grid(1, 8).map(s =>
      ['A1', 'A2'].includes(s.id) ? { ...s, status: 'sold' } : s,
    )
    const result = pickBestAvailable({ seats, quantity: 4, focal: FOCAL })
    expect(result.strategy).toBe('contiguous')
    expect(result.seatIds.sort()).toEqual(['A3', 'A4', 'A5', 'A6'])
  })

  it('never spans an aisle: a wide gap splits the row into segments', () => {
    // Row of 8 with an aisle after seat 4 (a 72px jump, 3x the median step).
    const seats = grid(1, 8).map(s => {
      const n = Number(s.seat_number)
      return n > 4 ? { ...s, x: s.x + 72 } : s
    })
    const result = pickBestAvailable({ seats, quantity: 4, focal: FOCAL })
    expect(result.strategy).toBe('contiguous')
    const nums = result.seatIds.map(id => Number(id.slice(1))).sort((a, b) => a - b)
    const allLeft = nums.every(n => n <= 4)
    const allRight = nums.every(n => n >= 5)
    expect(allLeft || allRight).toBe(true)
  })

  it('holds one segment across a curved row (varying y, even steps)', () => {
    // A bowed row: y dips by a sine, steps stay near-even.
    const seats = grid(1, 8).map((s, i) => ({
      ...s,
      y: s.y + Math.sin((Math.PI * i) / 7) * 14,
    }))
    const result = pickBestAvailable({ seats, quantity: 6, focal: FOCAL })
    expect(result.strategy).toBe('contiguous')
    expect(result.seatIds).toHaveLength(6)
  })
})

describe('the scattered and table legs', () => {
  it('falls to scattered when no single row can hold the party', () => {
    const seats = grid(3, 4) // rows of 4
    const focal = { x: ((4 - 1) * 24) / 2, y: -40 } // top centre of THIS grid
    const result = pickBestAvailable({ seats, quantity: 6, focal })
    expect(result.strategy).toBe('scattered')
    expect(result.seatIds).toHaveLength(6)
    // Scattered still prefers the stage side: row A fully in the pick.
    expect(result.seatIds.filter(id => id.startsWith('A'))).toHaveLength(4)
  })

  it('table rows never leak into contiguous picks, and host the party when nothing else can', () => {
    const tableSeats = Array.from({ length: 10 }, (_, i) =>
      seat(`T1-${i + 1}`, 'Table 1', i + 1, 300 + Math.cos((i / 10) * 2 * Math.PI) * 40, 100 + Math.sin((i / 10) * 2 * Math.PI) * 40),
    )
    const rowSeats = grid(1, 4)
    const result = pickBestAvailable(
      { seats: [...rowSeats, ...tableSeats], quantity: 10, focal: FOCAL },
    )
    expect(result.strategy).toBe('table')
    expect(result.seatIds.every(id => id.startsWith('T1-'))).toBe(true)
  })

  it('signals ga when nothing seated fits', () => {
    const result = pickBestAvailable({ seats: grid(1, 2), quantity: 6, focal: FOCAL })
    expect(result.strategy).toBe('ga')
    expect(result.seatIds).toEqual([])
  })
})

describe('accessible and companion mixing', () => {
  it('one request mixes wheelchair spaces, companions, and the rest of the party', () => {
    const seats = [
      ...grid(2, 6),
      seat('ACC1', 'A', 7, 6 * 24, 0, { seat_type: 'accessible' }),
      seat('COMP1', 'A', 8, 7 * 24, 0, { seat_type: 'companion' }),
    ]
    const result = pickBestAvailable({
      seats,
      quantity: 3,
      accessibleNeeded: 1,
      focal: FOCAL,
    })
    expect(result.seatIds).toContain('ACC1')
    expect(result.seatIds).toContain('COMP1')
    expect(result.seatIds).toHaveLength(3)
    // The third seat clusters beside the accessible pair, not across the room.
    const third = result.seatIds.find(id => id !== 'ACC1' && id !== 'COMP1')
    expect(['A5', 'A6', 'B6', 'B5']).toContain(third)
  })

  it('returns none rather than pretending when the wheelchair spaces do not exist', () => {
    const result = pickBestAvailable({
      seats: grid(2, 6),
      quantity: 2,
      accessibleNeeded: 1,
      focal: FOCAL,
    })
    expect(result.strategy).toBe('none')
    expect(result.seatIds).toEqual([])
  })
})

describe('the buyer-selection orphan guard (S2)', () => {
  it('flags the single seat a selection strands', async () => {
    const { selectionCreatedOrphans } = await import('@/lib/seating/best-available')
    // Row A of 4: selecting 2 and 3 strands seat 1 ONLY if 4 is sold too.
    const seats = grid(1, 4).map(s => (s.id === 'A4' ? { ...s, status: 'sold' } : s))
    const orphans = selectionCreatedOrphans(seats, new Set(['A2', 'A3']))
    expect(orphans.map(s => s.id)).toEqual(['A1'])
  })

  it('stays quiet when the neighbours remain paired', () => {
    // Selecting 3 and 4 of a row of 8 leaves {1,2} and {5..8}: no orphan.
    return import('@/lib/seating/best-available').then(({ selectionCreatedOrphans }) => {
      const orphans = selectionCreatedOrphans(grid(1, 8), new Set(['A3', 'A4']))
      expect(orphans).toEqual([])
    })
  })

  it('never blames the buyer for seats that were already isolated', async () => {
    const { selectionCreatedOrphans } = await import('@/lib/seating/best-available')
    // Seat 2 sold: seat 1 was orphaned before any selection existed.
    const seats = grid(1, 4).map(s => (s.id === 'A2' ? { ...s, status: 'sold' } : s))
    const orphans = selectionCreatedOrphans(seats, new Set(['A3']))
    expect(orphans.map(s => s.id)).toEqual(['A4'])
  })
})

describe('resolveFocalPoint', () => {
  const seats = grid(2, 4)

  it('an explicit layout focal wins', () => {
    expect(resolveFocalPoint({ focal: { x: 10, y: 20 } }, seats)).toEqual({ x: 10, y: 20 })
  })

  it('a stage scenery area anchors it next', () => {
    const layout = {
      areas: [
        { label: 'Bar', style: 'scenery', x: 500, y: 500, width: 40, height: 20 },
        { label: 'Main Stage', style: 'scenery', x: 100, y: 0, width: 200, height: 40 },
      ],
    }
    expect(resolveFocalPoint(layout, seats)).toEqual({ x: 200, y: 20 })
  })

  it('falls back to the top centre of the seat field', () => {
    const focal = resolveFocalPoint(null, seats)
    expect(focal.x).toBeCloseTo(36) // (0 + 72) / 2
    expect(focal.y).toBe(-40)
  })
})
