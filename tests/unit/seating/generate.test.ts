import { describe, it, expect } from 'vitest'
import {
  alphaLabel,
  generateLayout,
  validateLayout,
  type RowsBlock,
  type TableBlock,
  type AreaBlock,
} from '@/lib/seating/generate'

describe('alphaLabel', () => {
  it('runs A..Z then AA..', () => {
    expect(alphaLabel(0)).toBe('A')
    expect(alphaLabel(25)).toBe('Z')
    expect(alphaLabel(26)).toBe('AA')
    expect(alphaLabel(27)).toBe('AB')
  })
})

describe('generateLayout - rows blocks', () => {
  const base: RowsBlock = {
    id: 'b1',
    kind: 'rows',
    section: 'Stalls',
    color: '#D4A017',
    x: 100,
    y: 100,
    rows: 3,
    seatsPerRow: 4,
  }

  it('generates rows A-C with numbered seats and uniform spacing', () => {
    const layout = generateLayout([base])
    expect(layout.totalSeats).toBe(12)
    const stalls = layout.sections[0]
    expect(stalls.rows.map(r => r.label)).toEqual(['A', 'B', 'C'])
    expect(stalls.rows[0].seats.map(s => s.number)).toEqual(['1', '2', '3', '4'])
    expect(stalls.rows[0].seats[1].x).toBe(124) // default 24px spacing
    expect(stalls.rows[1].seats[0].y).toBe(126) // default 26px row spacing
  })

  it('supports irregular per-row seat counts (a real comedy cellar)', () => {
    const layout = generateLayout([{ ...base, rows: 3, seatsPerRow: [3, 5, 2] }])
    const rows = layout.sections[0].rows
    expect(rows[0].seats).toHaveLength(3)
    expect(rows[1].seats).toHaveLength(5)
    expect(rows[2].seats).toHaveLength(2)
    expect(layout.totalSeats).toBe(10)
  })

  it('supports custom numbering: numeric rows, seat start, reversed seats', () => {
    const layout = generateLayout([
      {
        ...base,
        rows: 2,
        seatsPerRow: 3,
        rowLabelScheme: 'numeric',
        rowLabelStart: 10,
        seatStart: 101,
        reverseSeats: true,
      },
    ])
    const rows = layout.sections[0].rows
    expect(rows.map(r => r.label)).toEqual(['10', '11'])
    expect(rows[0].seats.map(s => s.number)).toEqual(['103', '102', '101'])
  })

  it('honours removed, blocked, accessible, companion and label overrides', () => {
    const layout = generateLayout([
      {
        ...base,
        rows: 1,
        seatsPerRow: 5,
        removedSeats: ['A-3'],
        blockedSeats: ['A-1'],
        accessibleSeats: ['A-4'],
        companionSeats: ['A-5'],
        labelOverrides: { 'A-2': 'Box' },
      },
    ])
    const seats = layout.sections[0].rows[0].seats
    expect(seats).toHaveLength(4) // A-3 carved out
    expect(seats[0].blocked).toBe(true)
    expect(seats[1].number).toBe('Box')
    expect(seats.find(s => s.type === 'accessible')?.number).toBe('4')
    expect(seats.find(s => s.type === 'companion')?.number).toBe('5')
  })

  it('curved rows bow the middle seats upward, ends anchored', () => {
    const layout = generateLayout([{ ...base, rows: 1, seatsPerRow: 5, curveDepth: 20 }])
    const seats = layout.sections[0].rows[0].seats
    expect(seats[0].y).toBe(100)
    expect(seats[4].y).toBe(100)
    expect(seats[2].y).toBe(80) // mid-row, full bow
  })

  it('rotation rotates the whole block around its origin', () => {
    const layout = generateLayout([{ ...base, rows: 1, seatsPerRow: 2, rotation: 90 }])
    const seats = layout.sections[0].rows[0].seats
    expect(seats[0].x).toBe(100)
    expect(seats[0].y).toBe(100)
    expect(seats[1].x).toBe(100) // rotated onto the vertical
    expect(seats[1].y).toBe(124)
  })
})

describe('generateLayout - tables', () => {
  const table: TableBlock = {
    id: 't1',
    kind: 'table',
    shape: 'round',
    section: 'Gala floor',
    label: 'Table 1',
    seats: 8,
    x: 200,
    y: 200,
  }

  it('places round-table seats evenly on the circle', () => {
    const layout = generateLayout([table])
    const seats = layout.sections[0].rows[0].seats
    expect(seats).toHaveLength(8)
    expect(layout.sections[0].rows[0].label).toBe('Table 1')
    // First seat at the top of the circle
    expect(seats[0].x).toBe(200)
    expect(seats[0].y).toBeLessThan(200)
    // All seats equidistant from the centre
    const dists = seats.map(s => Math.hypot(s.x - 200, s.y - 200).toFixed(1))
    expect(new Set(dists).size).toBe(1)
  })

  it('square tables distribute seats around four sides', () => {
    const layout = generateLayout([{ ...table, shape: 'square', seats: 8, label: 'Table 2' }])
    const seats = layout.sections[0].rows[0].seats
    expect(seats).toHaveLength(8)
    const xs = new Set(seats.map(s => s.x))
    const ys = new Set(seats.map(s => s.y))
    expect(xs.size).toBeGreaterThan(1)
    expect(ys.size).toBeGreaterThan(1)
  })

  it('two tables in one section stay unique (label is the row key)', () => {
    const layout = generateLayout([
      table,
      { ...table, id: 't2', label: 'Table 2', x: 400 },
    ])
    expect(validateLayout(layout)).toEqual([])
    expect(layout.sections[0].rows.map(r => r.label)).toEqual(['Table 1', 'Table 2'])
  })
})

describe('generateLayout - areas and mixed layouts', () => {
  it('areas render but generate no seats (GA sells through the tier)', () => {
    const area: AreaBlock = {
      id: 'a1',
      kind: 'area',
      section: 'Standing',
      tierName: 'General Admission',
      label: 'Standing zone',
      x: 0,
      y: 300,
      width: 200,
      height: 80,
      capacity: 150,
    }
    const layout = generateLayout([area])
    expect(layout.totalSeats).toBe(0)
    expect(layout.areas[0]).toMatchObject({ label: 'Standing zone', capacity: 150 })
  })

  it('a mixed venue: reserved rows + tables + a standing zone', () => {
    const layout = generateLayout([
      { id: 'r', kind: 'rows', section: 'Stalls', tierName: 'A Reserve', x: 0, y: 0, rows: 2, seatsPerRow: 6 },
      { id: 't', kind: 'table', shape: 'round', section: 'Tables', tierName: 'Table seat', label: 'Table 1', seats: 6, x: 300, y: 60 },
      { id: 'a', kind: 'area', section: 'Standing', tierName: 'GA', label: 'Back standing', x: 0, y: 200, width: 300, height: 60 },
    ])
    expect(layout.sections.map(s => s.name)).toEqual(['Stalls', 'Tables'])
    expect(layout.sections[0].tier_name).toBe('A Reserve')
    expect(layout.totalSeats).toBe(18)
    expect(layout.areas).toHaveLength(1)
    expect(validateLayout(layout)).toEqual([])
  })

  it('validateLayout flags duplicate seat identities inside a section', () => {
    const layout = generateLayout([
      { id: 'x', kind: 'rows', section: 'S', x: 0, y: 0, rows: 1, seatsPerRow: 2 },
      { id: 'y', kind: 'rows', section: 'S', x: 0, y: 100, rows: 1, seatsPerRow: 2 },
    ])
    const issues = validateLayout(layout)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].message).toContain('Duplicate seat')
  })

  it('no capacity ceiling: a 1200-seat chart generates cleanly', () => {
    const layout = generateLayout([
      { id: 'big', kind: 'rows', section: 'Arena', x: 0, y: 0, rows: 30, seatsPerRow: 40 },
    ])
    expect(layout.totalSeats).toBe(1200)
    expect(validateLayout(layout)).toEqual([])
  })
})
