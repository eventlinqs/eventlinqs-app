import { describe, it, expect } from 'vitest'
import { generateLayout, type RowsBlock } from '@/lib/seating/generate'
import {
  pickBestAvailable,
  scorePick,
  resolveFocalPoint,
  type BASeat,
} from '@/lib/seating/best-available'

/**
 * F23/F24: the reproducible proof that the cascade's pick beats a naive
 * row-fill on a real chart, scored on contiguity, focal proximity and
 * orphans created. Everything here is deterministic: the chart comes from
 * the real generator, the occupancy from a fixed linear congruential
 * sequence, the naive allocator is the classic first-fit in reading order.
 */

function buildRealChart(): BASeat[] {
  const aReserve: RowsBlock = {
    id: 'a', kind: 'rows', section: 'A Reserve', x: 100, y: 100,
    rows: 6, seatsPerRow: 18, curveDepth: 24, align: 'centre',
  }
  const bReserve: RowsBlock = {
    id: 'b', kind: 'rows', section: 'B Reserve', x: 76, y: 300,
    rows: 8, seatsPerRow: 20,
  }
  const layout = generateLayout([aReserve, bReserve])
  const seats: BASeat[] = []
  for (const section of layout.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        seats.push({
          id: `${section.name}:${row.label}:${seat.number}`,
          section_id: section.name,
          row_label: row.label,
          seat_number: seat.number,
          x: seat.x,
          y: seat.y,
          status: 'available',
          seat_type: seat.type,
        })
      }
    }
  }
  return seats
}

/** Deterministic occupancy: LCG-driven, identical on every run. */
function occupy(seats: BASeat[], fraction: number, seed: number): BASeat[] {
  let state = seed
  const next = () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
  return seats.map(s => ({ ...s, status: next() < fraction ? 'sold' : 'available' }))
}

/** The classic naive allocator: first N available seats in reading order. */
function naiveRowFill(seats: BASeat[], quantity: number): string[] {
  const inReadingOrder = [...seats].sort((a, b) => {
    const sec = (a.section_id ?? '').localeCompare(b.section_id ?? '')
    if (sec !== 0) return sec
    const row = a.row_label.localeCompare(b.row_label)
    if (row !== 0) return row
    return a.x - b.x
  })
  return inReadingOrder
    .filter(s => s.status === 'available')
    .slice(0, quantity)
    .map(s => s.id)
}

describe('best-available quality scoring (F23)', () => {
  const chart = buildRealChart()
  const focal = resolveFocalPoint(null, chart)

  it('a contiguous front block scores higher than the same seats scattered', () => {
    const rowA = chart.filter(s => s.section_id === 'A Reserve' && s.row_label === 'A')
    const together = rowA.slice(7, 11).map(s => s.id)
    const scattered = [rowA[0], rowA[5], rowA[11], rowA[16]].map(s => s.id)
    const qTogether = scorePick(chart, together, focal)
    const qScattered = scorePick(chart, scattered, focal)
    expect(qTogether.contiguity).toBe(1)
    expect(qScattered.contiguity).toBe(0.25) // largest block is a single
    expect(qTogether.composite).toBeGreaterThan(qScattered.composite)
  })

  it('a four split into pairs never masquerades as together', () => {
    const rowA = chart.filter(s => s.section_id === 'A Reserve' && s.row_label === 'A')
    const pairs = [rowA[2], rowA[3], rowA[8], rowA[9]].map(s => s.id)
    expect(scorePick(chart, pairs, focal).contiguity).toBe(0.5)
  })

  it('a front pick outscores the same-shaped pick at the back of the room', () => {
    const front = chart.filter(s => s.section_id === 'A Reserve' && s.row_label === 'A').slice(7, 11)
    const back = chart.filter(s => s.section_id === 'B Reserve' && s.row_label === 'H').slice(8, 12)
    const qFront = scorePick(chart, front.map(s => s.id), focal)
    const qBack = scorePick(chart, back.map(s => s.id), focal)
    expect(qFront.focalDistance).toBeLessThan(qBack.focalDistance)
    expect(qFront.composite).toBeGreaterThan(qBack.composite)
  })

  it('creating an orphan costs the composite', () => {
    // Leave exactly one open neighbour beside the pick: an orphan.
    const rowB = chart.filter(s => s.section_id === 'A Reserve' && s.row_label === 'B')
    const withSold = chart.map(s => {
      const inRowB = s.section_id === 'A Reserve' && s.row_label === 'B'
      const n = Number(s.seat_number)
      // Seats 1..6 stay open, 7..18 sold: picking 2..4 strands seat 1 only
      // (5 and 6 stay a pair); picking 1..3 leaves the clean 4-5-6 triple.
      if (inRowB && n >= 7) return { ...s, status: 'sold' }
      return s
    })
    const stranding = rowB.filter(s => [2, 3, 4].includes(Number(s.seat_number))).map(s => s.id)
    const q = scorePick(withSold, stranding, focal)
    expect(q.orphansCreated).toBe(1)
    const clean = rowB.filter(s => [1, 2, 3].includes(Number(s.seat_number))).map(s => s.id)
    const qClean = scorePick(withSold, clean, focal)
    expect(qClean.orphansCreated).toBe(0)
    expect(qClean.composite).toBeGreaterThan(q.composite)
  })

  it('every cascade pick carries its quality score', () => {
    const result = pickBestAvailable({ seats: chart, quantity: 4, focal })
    expect(result.strategy).toBe('contiguous')
    expect(result.quality).toBeDefined()
    expect(result.quality!.contiguity).toBe(1)
    expect(result.quality!.orphansCreated).toBe(0)
    expect(result.quality!.composite).toBeGreaterThan(50)
  })
})

describe('the cascade beats naive row-fill on a real chart (F24, reproducible)', () => {
  const chart = buildRealChart()
  const focal = resolveFocalPoint(null, chart)
  const scenarios = [
    { name: 'light (20% sold, seed 7)', fraction: 0.2, seed: 7 },
    { name: 'medium (45% sold, seed 1234)', fraction: 0.45, seed: 1234 },
    { name: 'heavy (70% sold, seed 99)', fraction: 0.7, seed: 99 },
  ]
  const parties = [2, 3, 4, 5, 6]

  it('our composite meets or beats naive in EVERY scenario and beats it in aggregate', () => {
    let ourTotal = 0
    let naiveTotal = 0
    let strictWins = 0
    let comparisons = 0
    for (const scenario of scenarios) {
      const seats = occupy(chart, scenario.fraction, scenario.seed)
      for (const quantity of parties) {
        const ours = pickBestAvailable({ seats, quantity, focal })
        const naive = naiveRowFill(seats, quantity)
        if (ours.seatIds.length < quantity || naive.length < quantity) continue
        comparisons += 1
        const ourQ = scorePick(seats, ours.seatIds, focal)
        const naiveQ = scorePick(seats, naive, focal)
        ourTotal += ourQ.composite
        naiveTotal += naiveQ.composite
        if (ourQ.composite > naiveQ.composite) strictWins += 1
        expect(
          ourQ.composite,
          `${scenario.name}, party of ${quantity}: ours ${ourQ.composite} vs naive ${naiveQ.composite}`,
        ).toBeGreaterThanOrEqual(naiveQ.composite)
      }
    }
    expect(comparisons).toBeGreaterThanOrEqual(12)
    expect(ourTotal).toBeGreaterThan(naiveTotal)
    // The win is systemic, not a single lucky case.
    expect(strictWins).toBeGreaterThanOrEqual(Math.ceil(comparisons / 2))
  })

  it('naive row-fill strands more singles than our pick, and never fewer', () => {
    let naiveOrphans = 0
    let ourOrphans = 0
    let naiveOrphanCases = 0
    for (const scenario of scenarios) {
      const seats = occupy(chart, scenario.fraction, scenario.seed)
      for (const quantity of parties) {
        const ours = pickBestAvailable({ seats, quantity, focal })
        const naive = naiveRowFill(seats, quantity)
        if (ours.seatIds.length < quantity || naive.length < quantity) continue
        const naiveQ = scorePick(seats, naive, focal)
        const ourQ = scorePick(seats, ours.seatIds, focal)
        naiveOrphans += naiveQ.orphansCreated
        ourOrphans += ourQ.orphansCreated
        if (naiveQ.orphansCreated > 0) naiveOrphanCases += 1
        // When the cascade does strand, it is only ever on a degraded leg
        // (no clean contiguous window existed), stated honestly.
        if (ourQ.orphansCreated > 0) {
          expect(['contiguous-with-orphan', 'scattered']).toContain(ours.strategy)
        }
      }
    }
    expect(naiveOrphanCases).toBeGreaterThan(0)
    expect(ourOrphans).toBeLessThan(naiveOrphans)
  })
})
