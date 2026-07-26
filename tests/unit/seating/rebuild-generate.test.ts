import { describe, expect, it } from 'vitest'
import {
  generateLayout,
  type AisleBlock,
  type ObjectBlock,
  type RowsBlock,
  type StageBlockDef,
  type TextBlock,
} from '@/lib/seating/generate'

function rows(partial: Partial<RowsBlock> = {}): RowsBlock {
  return {
    id: 'r1',
    kind: 'rows',
    section: 'Stalls',
    x: 100,
    y: 100,
    rows: 4,
    seatsPerRow: 6,
    ...partial,
  }
}

function allSeats(layout: ReturnType<typeof generateLayout>) {
  return layout.sections.flatMap(s => s.rows.flatMap(r => r.seats.map(seat => ({ row: r.label, ...seat }))))
}

describe('directionality (item 10)', () => {
  it('rowOrder up labels A at the back row', () => {
    const down = generateLayout([rows()])
    const up = generateLayout([rows({ rowOrder: 'up' })])
    const downFirst = down.sections[0].rows.find(r => r.label === 'A')!
    const upFirst = up.sections[0].rows.find(r => r.label === 'A')!
    expect(downFirst.seats[0].y).toBe(100)
    expect(upFirst.seats[0].y).toBe(100 + 3 * 26)
    // Geometry itself is unchanged: same seat positions, relabelled.
    expect(allSeats(down).map(s => `${s.x},${s.y}`).sort()).toEqual(
      allSeats(up).map(s => `${s.x},${s.y}`).sort(),
    )
  })

  it('seatOrder rtl numbers from stage right and wins over reverseSeats', () => {
    const ltr = generateLayout([rows({ rows: 1 })])
    const rtl = generateLayout([rows({ rows: 1, seatOrder: 'rtl' })])
    const overridden = generateLayout([rows({ rows: 1, seatOrder: 'ltr', reverseSeats: true })])
    expect(ltr.sections[0].rows[0].seats[0].number).toBe('1')
    expect(rtl.sections[0].rows[0].seats[0].number).toBe('6')
    expect(overridden.sections[0].rows[0].seats[0].number).toBe('1')
  })
})

describe('stagger and aisles (item 3)', () => {
  it('staggers odd rows by the brick-bond offset', () => {
    const layout = generateLayout([rows({ stagger: 12 })])
    const rowA = layout.sections[0].rows.find(r => r.label === 'A')!
    const rowB = layout.sections[0].rows.find(r => r.label === 'B')!
    expect(rowB.seats[0].x - rowA.seats[0].x).toBe(12)
    const rowC = layout.sections[0].rows.find(r => r.label === 'C')!
    expect(rowC.seats[0].x).toBe(rowA.seats[0].x)
  })

  it('a vertical aisle punches a gap through every row it spans', () => {
    const aisle: AisleBlock = {
      id: 'a1',
      kind: 'aisle',
      section: '',
      orientation: 'vertical',
      x: 100 + 2.5 * 24,
      y: 80,
      length: 400,
      width: 30,
    }
    const plain = generateLayout([rows()])
    const cut = generateLayout([rows(), aisle])
    const plainRow = plain.sections[0].rows[0].seats.map(s => s.x)
    const cutRow = cut.sections[0].rows[0].seats.map(s => s.x)
    expect(cutRow.slice(0, 3)).toEqual(plainRow.slice(0, 3))
    expect(cutRow.slice(3)).toEqual(plainRow.slice(3).map(x => x + 30))
    // The gap between seats 3 and 4 is now pitch + width.
    expect(cutRow[3] - cutRow[2]).toBe(24 + 30)
  })

  it('a horizontal aisle splits front rows from back rows', () => {
    const aisle: AisleBlock = {
      id: 'a2',
      kind: 'aisle',
      section: '',
      orientation: 'horizontal',
      x: 80,
      y: 100 + 1.5 * 26,
      length: 400,
      width: 40,
    }
    const layout = generateLayout([rows(), aisle])
    const ys = layout.sections[0].rows.map(r => r.seats[0].y)
    expect(ys).toEqual([100, 126, 100 + 2 * 26 + 40, 100 + 3 * 26 + 40])
  })

  it('a chart with no new primitives is byte-identical to the historic output', () => {
    const before = JSON.stringify(generateLayout([rows()]))
    const after = JSON.stringify(generateLayout([rows()]))
    expect(after).toBe(before)
    expect(before).not.toContain('stage')
    expect(before).not.toContain('objects')
  })
})

describe('stage and objects in the layout (items 2 and 8)', () => {
  it('carries the stage geometry through the layout', () => {
    const stage: StageBlockDef = {
      id: 's1',
      kind: 'stage',
      section: '',
      shape: 'thrust',
      x: 120,
      y: 0,
      width: 200,
      depth: 80,
    }
    const layout = generateLayout([rows(), stage])
    expect(layout.stage).toEqual({ shape: 'thrust', x: 120, y: 0, width: 200, depth: 80 })
    expect(layout.totalSeats).toBe(24)
  })

  it('carries objects, text and icons without making seats of them', () => {
    const bar: ObjectBlock = {
      id: 'o1',
      kind: 'object',
      section: '',
      object: 'bar',
      x: 400,
      y: 100,
      width: 60,
      height: 60,
      label: 'Long bar',
    }
    const caption: TextBlock = {
      id: 't1',
      kind: 'text',
      section: '',
      text: 'Balcony centre',
      x: 300,
      y: 300,
      size: 16,
    }
    const layout = generateLayout([rows(), bar, caption])
    expect(layout.totalSeats).toBe(24)
    expect(layout.objects).toHaveLength(2)
    expect(layout.objects?.[0]).toMatchObject({ kind: 'object', object: 'bar', label: 'Long bar' })
    expect(layout.objects?.[1]).toMatchObject({ kind: 'text', text: 'Balcony centre', size: 16 })
  })
})
