import { describe, it, expect } from 'vitest'
import {
  pickBestAvailable,
  scorePick,
  type BASeat,
  type FocalPoint,
} from '@/lib/seating/best-available'

/**
 * F21: price and party size in ONE request. The band masks unaffordable
 * seats as un-pickable (they split rows like sold seats), the cascade
 * still runs its full shape inside the band, and orphan accounting runs
 * against the whole real room.
 */

const focal: FocalPoint = { x: 160, y: 0 }

function seat(
  id: string,
  row: string,
  n: number,
  price: number,
  status = 'available',
): BASeat {
  return {
    id,
    section_id: row <= 'C' ? 'a-reserve' : 'b-reserve',
    row_label: row,
    seat_number: String(n),
    x: n * 24,
    y: row.charCodeAt(0) * 26,
    status,
    seat_type: 'standard',
    price_cents: price,
  }
}

/** Rows A ($5900, near stage) and D ($3900, farther back), 10 seats each. */
function twoPriceChart(): BASeat[] {
  const seats: BASeat[] = []
  for (let n = 1; n <= 10; n++) seats.push(seat(`A-${n}`, 'A', n, 5900))
  for (let n = 1; n <= 10; n++) seats.push(seat(`D-${n}`, 'D', n, 3900))
  return seats
}

describe('price and party in one request (F21)', () => {
  it('a party of four under $39 lands together in the $39 row, never the closer $59 row', () => {
    const result = pickBestAvailable({
      seats: twoPriceChart(),
      quantity: 4,
      focal,
      maxPriceCents: 3900,
    })
    expect(result.strategy).toBe('contiguous')
    expect(result.seatIds).toHaveLength(4)
    for (const id of result.seatIds) expect(id.startsWith('D-')).toBe(true)
  })

  it('without a band the same party takes the best seats in the room', () => {
    const result = pickBestAvailable({ seats: twoPriceChart(), quantity: 4, focal })
    expect(result.strategy).toBe('contiguous')
    for (const id of result.seatIds) expect(id.startsWith('A-')).toBe(true)
  })

  it('a band nothing satisfies returns an honest none, never a GA shrug', () => {
    const result = pickBestAvailable({
      seats: twoPriceChart(),
      quantity: 2,
      focal,
      maxPriceCents: 1000,
    })
    expect(result.strategy).toBe('none')
    expect(result.seatIds).toHaveLength(0)
  })

  it('the banded pick is orphan-safe: it will not strand the last cheap single', () => {
    // In the $39 row only seats 1..5 remain; a naive 2..5 or 1..4 window is
    // fine, but the pick must not take 2..3 and leave 1 alone, and must not
    // take 4..5 leaving 1..3 fine. Sell 6..10.
    const seats = twoPriceChart().map(s =>
      s.row_label === 'D' && Number(s.seat_number) >= 6 ? { ...s, status: 'sold' } : s,
    )
    const result = pickBestAvailable({
      seats,
      quantity: 2,
      focal,
      maxPriceCents: 3900,
    })
    expect(result.strategy).toBe('contiguous')
    const quality = scorePick(seats, result.seatIds, focal)
    expect(quality.orphansCreated).toBe(0)
  })

  it('an unaffordable seat mid-row splits the run like a sold seat', () => {
    // Row D seat 5 is priced up to $5900: a four must sit 1..4 or 6..9,
    // never span the expensive chair.
    const seats = twoPriceChart().map(s =>
      s.id === 'D-5' ? { ...s, price_cents: 5900 } : s,
    )
    const result = pickBestAvailable({
      seats,
      quantity: 4,
      focal,
      maxPriceCents: 3900,
    })
    expect(result.strategy).toBe('contiguous')
    expect(result.seatIds).not.toContain('D-5')
    const numbers = result.seatIds.map(id => Number(id.split('-')[1])).sort((a, b) => a - b)
    const spansFive = numbers[0] < 5 && numbers[numbers.length - 1] > 5
    expect(spansFive).toBe(false)
  })

  it('a min and max band picks inside the band only', () => {
    const result = pickBestAvailable({
      seats: twoPriceChart(),
      quantity: 3,
      focal,
      minPriceCents: 5000,
      maxPriceCents: 6000,
    })
    expect(result.strategy).toBe('contiguous')
    for (const id of result.seatIds) expect(id.startsWith('A-')).toBe(true)
  })
})
