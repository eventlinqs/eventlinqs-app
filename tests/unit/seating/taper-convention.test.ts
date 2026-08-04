import { describe, expect, it } from 'vitest'
import { alphaLabel, ALPHABET_NO_IO, generateLayout, type RowsBlock } from '@/lib/seating/generate'
import { displayRowLabel } from '@/lib/seating/render/labels'

function rowsBlock(partial: Partial<RowsBlock>): RowsBlock {
  return {
    id: 'b1',
    kind: 'rows',
    section: 'Stalls',
    x: 100,
    y: 100,
    rows: 5,
    seatsPerRow: 10,
    ...partial,
  }
}

describe('correction 3: the deliberate taper', () => {
  it('lengthens rows toward the back by the stated count', () => {
    const layout = generateLayout([rowsBlock({ taper: 1, align: 'centre' })])
    const counts = layout.sections[0].rows.map(r => r.seats.length)
    expect(counts).toEqual([10, 11, 12, 13, 14])
  })

  it('shortens rows toward the back and clamps at one seat', () => {
    const layout = generateLayout([rowsBlock({ rows: 6, seatsPerRow: 4, taper: -1 })])
    const counts = layout.sections[0].rows.map(r => r.seats.length)
    expect(counts).toEqual([4, 3, 2, 1, 1, 1])
  })

  it('supports half-seat-per-row steps, rounded per row', () => {
    const layout = generateLayout([rowsBlock({ taper: 0.5 })])
    const counts = layout.sections[0].rows.map(r => r.seats.length)
    expect(counts).toEqual([10, 11, 11, 12, 12])
  })

  it('keeps the raked edge on the column grid under centre alignment', () => {
    // SUPERSEDES the old assertion of a 12px (half-seat) step per row. That
    // step was the defect: it threw alternate rows off the column grid and
    // read as drifting, freehand rows. The grid law wins over a smooth
    // diagonal, so the raked edge is a staircase of WHOLE seats.
    const spacing = 24
    const layout = generateLayout([rowsBlock({ taper: 1, align: 'centre', seatSpacing: spacing })])
    const rows = layout.sections[0].rows
    const firstXs = rows.map(r => Math.min(...r.seats.map(s => s.x)))
    for (let i = 1; i < firstXs.length; i++) {
      const step = firstXs[i - 1] - firstXs[i]
      // Never widens toward the back, and only ever by whole seats.
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step % spacing).toBeCloseTo(0, 9)
    }
  })

  it('taper only removes seats from row ends: every seat stays on one grid', () => {
    // The founder's law, enforced: a seat's x is its column index times the
    // pitch and nothing else moves it. On a tapered, centre-aligned block the
    // number of distinct x values must equal the widest row's seat count.
    const spacing = 24
    const originX = 80
    const layout = generateLayout([
      rowsBlock({ x: originX, rows: 15, seatsPerRow: 30, taper: 0.5, align: 'centre', seatSpacing: spacing }),
    ])
    const rows = layout.sections[0].rows
    const seats = rows.flatMap(r => r.seats)
    for (const s of seats) {
      const column = (s.x - originX) / spacing
      expect(column).toBeCloseTo(Math.round(column), 9)
    }
    const distinctX = new Set(seats.map(s => s.x))
    const widest = Math.max(...rows.map(r => r.seats.length))
    expect(distinctX.size).toBe(widest)
  })
})

describe('the straight-row grid law', () => {
  it('a default block puts every seat in column N at an identical x', () => {
    // This is the test that stops drifting rows coming back. No curve, no
    // skew, no stagger, no taper: pure column index times pitch.
    const spacing = 24
    const layout = generateLayout([
      rowsBlock({ x: 100, y: 100, rows: 12, seatsPerRow: 18, seatSpacing: spacing }),
    ])
    const rows = layout.sections[0].rows
    expect(rows).toHaveLength(12)
    const firstRow = rows[0].seats.map(s => s.x).sort((a, b) => a - b)
    for (const row of rows) {
      const xs = row.seats.map(s => s.x).sort((a, b) => a - b)
      expect(xs).toHaveLength(firstRow.length)
      xs.forEach((x, column) => {
        expect(x).toBe(firstRow[column])
      })
    }
    // And the columns themselves are exactly one pitch apart.
    for (let c = 1; c < firstRow.length; c++) {
      expect(firstRow[c] - firstRow[c - 1]).toBeCloseTo(spacing, 9)
    }
  })

  it('curve, skew and stagger are OFF by default in the generator', () => {
    // Defaulted off in generate.ts itself, not merely absent from seed data.
    const spacing = 24
    const layout = generateLayout([
      rowsBlock({ x: 100, y: 100, rows: 6, seatsPerRow: 10, seatSpacing: spacing, rowSpacing: 30 }),
    ])
    const rows = layout.sections[0].rows
    // No bow: every seat in a row shares one y.
    for (const row of rows) {
      const ys = new Set(row.seats.map(s => s.y))
      expect(ys.size).toBe(1)
    }
    // No skew and no stagger: every row starts at the same x.
    const firstXs = new Set(rows.map(r => Math.min(...r.seats.map(s => s.x))))
    expect(firstXs.size).toBe(1)
    // Rows are exactly rowSpacing apart, in order.
    const rowYs = rows.map(r => r.seats[0].y)
    for (let i = 1; i < rowYs.length; i++) {
      expect(rowYs[i] - rowYs[i - 1]).toBeCloseTo(30, 9)
    }
  })

  it('a row only bows when the organiser sets a curve explicitly', () => {
    const straight = generateLayout([rowsBlock({ rows: 3, seatsPerRow: 9 })])
    expect(new Set(straight.sections[0].rows[0].seats.map(s => s.y)).size).toBe(1)
    const curved = generateLayout([rowsBlock({ rows: 3, seatsPerRow: 9, curveDepth: 30 })])
    expect(new Set(curved.sections[0].rows[0].seats.map(s => s.y)).size).toBeGreaterThan(1)
  })

  it('an explicit per-row list wins over taper', () => {
    const layout = generateLayout([rowsBlock({ seatsPerRow: [6, 7, 8], rows: 3, taper: 5 })])
    const counts = layout.sections[0].rows.map(r => r.seats.length)
    expect(counts).toEqual([6, 7, 8])
  })
})

describe('correction 4: the I and O convention', () => {
  it('skip mode letters rows without I or O', () => {
    const layout = generateLayout([rowsBlock({ rows: 16, rowLetterConvention: 'skip' })])
    const labels = layout.sections[0].rows.map(r => r.label)
    expect(labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'])
  })

  it('skip mode honours a start letter within the reduced sequence', () => {
    const layout = generateLayout([rowsBlock({ rows: 3, rowLetterConvention: 'skip', rowLabelStart: 'H' })])
    expect(layout.sections[0].rows.map(r => r.label)).toEqual(['H', 'J', 'K'])
  })

  it('skip mode rolls over its 24-letter alphabet cleanly', () => {
    expect(alphaLabel(23, ALPHABET_NO_IO)).toBe('Z')
    expect(alphaLabel(24, ALPHABET_NO_IO)).toBe('AA')
    expect(ALPHABET_NO_IO).not.toContain('I')
    expect(ALPHABET_NO_IO).not.toContain('O')
  })

  it('dash mode (the default) keeps I and O in the data', () => {
    const layout = generateLayout([rowsBlock({ rows: 16 })])
    const labels = layout.sections[0].rows.map(r => r.label)
    expect(labels).toContain('I')
    expect(labels).toContain('O')
  })

  it('the plan displays I and O with the dash, and only those', () => {
    expect(displayRowLabel('I')).toBe('I-')
    expect(displayRowLabel('O')).toBe('O-')
    expect(displayRowLabel('J')).toBe('J')
    expect(displayRowLabel('AA')).toBe('AA')
  })
})
