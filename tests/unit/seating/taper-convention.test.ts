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

  it('keeps the raked edge regular under centre alignment', () => {
    const layout = generateLayout([rowsBlock({ taper: 1, align: 'centre', seatSpacing: 24 })])
    const rows = layout.sections[0].rows
    // Centred taper: each row's first seat steps outward by half a seat
    // spacing per added seat: a straight diagonal, not noise.
    const firstXs = rows.map(r => Math.min(...r.seats.map(s => s.x)))
    for (let i = 1; i < firstXs.length; i++) {
      expect(firstXs[i - 1] - firstXs[i]).toBeCloseTo(12, 5)
    }
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
