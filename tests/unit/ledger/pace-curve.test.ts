/**
 * THE CURVE AN ORGANISER READS. Close-out D1.
 *
 * `buildCurve` is the whole rule that decides what the "How your tickets sold"
 * panel says, and it is pure on purpose so the rule can be driven without a
 * database. Every case here is a way the panel could tell an organiser
 * something untrue.
 */
import { describe, expect, test } from 'vitest'
import { buildCurve } from '@/lib/ledger/pace'

const SLOT = {
  id: 'slot-1',
  category: 'music',
  subcategory: 'afrobeats',
  capacity: 200,
  slot_at: '2026-07-12T09:00:00.000Z',
  on_sale_at: '2026-06-01T00:00:00.000Z',
}

type Entry = Parameters<typeof buildCurve>[1][number]

const entry = (over: Partial<Entry>): Entry => ({
  kind: 'sale',
  occurred_at: '2026-06-12T09:00:00.000Z',
  days_out: 30,
  quantity: null,
  amount_cents: null,
  unit_amount_cents: null,
  old_price_cents: null,
  new_price_cents: null,
  inventory_class: null,
  demand_action: null,
  final_sold: null,
  final_revenue_cents: null,
  fill_percent: null,
  attended: null,
  no_shows: null,
  ...over,
})

describe('the sales curve', () => {
  test('reads left to right the way a calendar does: furthest out first, the day itself last', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 2, quantity: 5, amount_cents: 25_000, unit_amount_cents: 5000 }),
      entry({ days_out: 30, quantity: 1, amount_cents: 4500, unit_amount_cents: 4500 }),
      entry({ days_out: 14, quantity: 3, amount_cents: 15_000, unit_amount_cents: 5000 }),
    ])
    expect(curve.points.map(p => p.daysOut)).toEqual([30, 14, 2])
  })

  test('the running total only ever adds up along that order', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 30, quantity: 1, amount_cents: 4500, unit_amount_cents: 4500 }),
      entry({ days_out: 14, quantity: 3, amount_cents: 15_000, unit_amount_cents: 5000 }),
      entry({ days_out: 2, quantity: 5, amount_cents: 25_000, unit_amount_cents: 5000 }),
    ])
    expect(curve.points.map(p => p.cumulativeUnits)).toEqual([1, 4, 9])
    expect(curve.points.map(p => p.cumulativeAmountCents)).toEqual([4500, 19_500, 44_500])
    expect(curve.totals).toEqual({ units: 9, amountCents: 44_500, unitsReturned: 0 })
  })

  test('two sales on the same day are one point, because a day is a day', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 14, quantity: 2, amount_cents: 10_000, unit_amount_cents: 5000 }),
      entry({ days_out: 14, quantity: 1, amount_cents: 5000, unit_amount_cents: 5000 }),
    ])
    expect(curve.points).toHaveLength(1)
    expect(curve.points[0].units).toBe(3)
  })

  test('a refund pulls the curve DOWN on the day it happened, and is reported as units returned', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 30, quantity: 4, amount_cents: 20_000, unit_amount_cents: 5000 }),
      entry({ kind: 'refund', days_out: 10, quantity: -1, amount_cents: -5000 }),
    ])
    expect(curve.points.map(p => p.cumulativeUnits)).toEqual([4, 3])
    expect(curve.totals.amountCents).toBe(15_000)
    expect(curve.totals.unitsReturned).toBe(1)
  })

  test('money whose day is unknown is still in the total, because a wrong total is worse than a gap in the axis', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 30, quantity: 1, amount_cents: 4500, unit_amount_cents: 4500 }),
      entry({ days_out: null, quantity: 2, amount_cents: 9000 }),
    ])
    expect(curve.points).toHaveLength(1)
    expect(curve.totals.units).toBe(3)
    expect(curve.totals.amountCents).toBe(13_500)
  })
})

describe('the price line', () => {
  test('carries what one unit cost on each day something sold', () => {
    const curve = buildCurve(SLOT, [
      entry({ days_out: 30, quantity: 1, amount_cents: 4500, unit_amount_cents: 4500 }),
      entry({ days_out: 2, quantity: 1, amount_cents: 7000, unit_amount_cents: 7000 }),
    ])
    expect(curve.points.map(p => p.unitAmountCents)).toEqual([4500, 7000])
  })

  test('a day that only had a refund has no price, rather than a price of nothing', () => {
    const curve = buildCurve(SLOT, [entry({ kind: 'refund', days_out: 10, quantity: -1, amount_cents: -5000 })])
    expect(curve.points[0].unitAmountCents).toBeNull()
  })

  test('a price the organiser moved is recorded as a move, with what it was and what it became', () => {
    const curve = buildCurve(SLOT, [
      entry({ kind: 'price_change', days_out: 20, old_price_cents: 4500, new_price_cents: 5500, inventory_class: 'Early bird' }),
    ])
    expect(curve.priceMoves).toEqual([
      { daysOut: 20, inventoryClass: 'Early bird', oldAmountCents: 4500, newAmountCents: 5500 },
    ])
  })
})

describe('what people did without buying', () => {
  const demand = (action: string, daysOut = 20) => entry({ kind: 'demand', demand_action: action, days_out: daysOut })

  test('counts each of the five actions separately', () => {
    const curve = buildCurve(SLOT, [
      demand('page_view'),
      demand('page_view'),
      demand('sold_out_view'),
      demand('checkout_started'),
      demand('checkout_started'),
      demand('checkout_started'),
      demand('checkout_abandoned'),
      demand('waitlist_join'),
    ])
    expect(curve.demand.views).toBe(2)
    expect(curve.demand.soldOutViews).toBe(1)
    expect(curve.demand.checkoutsStarted).toBe(3)
    expect(curve.demand.checkoutsAbandoned).toBe(1)
    expect(curve.demand.waitlistJoins).toBe(1)
  })

  test('the share who did not finish is a percentage of who started', () => {
    const curve = buildCurve(SLOT, [
      demand('checkout_started'),
      demand('checkout_started'),
      demand('checkout_started'),
      demand('checkout_started'),
      demand('checkout_abandoned'),
      demand('checkout_abandoned'),
      demand('checkout_abandoned'),
    ])
    expect(curve.demand.abandonmentPercent).toBe(75)
  })

  test('nobody having started is ABSENT rather than nought percent, because dividing by nothing is not a fact', () => {
    const curve = buildCurve(SLOT, [demand('page_view')])
    expect(curve.demand.abandonmentPercent).toBeNull()
  })

  test('a demand row never lands on the sales curve', () => {
    const curve = buildCurve(SLOT, [demand('page_view'), demand('checkout_started')])
    expect(curve.points).toHaveLength(0)
    expect(curve.totals.units).toBe(0)
  })
})

describe('the closing figures', () => {
  test('are absent until the slot has been through the closing sweep', () => {
    expect(buildCurve(SLOT, [entry({ days_out: 30, quantity: 1, amount_cents: 4500 })]).close).toBeNull()
  })

  test('are read straight off the closing row rather than recomputed', () => {
    const curve = buildCurve(SLOT, [
      entry({ kind: 'close', days_out: 0, final_sold: 184, final_revenue_cents: 828_000, fill_percent: 92, attended: 171, no_shows: 13 }),
    ])
    expect(curve.close).toEqual({
      finalUnits: 184,
      finalAmountCents: 828_000,
      fillPercent: 92,
      attended: 171,
      noShows: 13,
    })
  })

  test('an unscanned door keeps attendance ABSENT all the way to the panel', () => {
    const curve = buildCurve(SLOT, [
      entry({ kind: 'close', days_out: 0, final_sold: 4, final_revenue_cents: 20_000, fill_percent: 2, attended: null, no_shows: null }),
    ])
    expect(curve.close?.attended).toBeNull()
    expect(curve.close?.noShows).toBeNull()
  })
})

describe('a slot the ledger has heard of but that has done nothing yet', () => {
  test('is an empty curve, never a curve of zeroes', () => {
    const curve = buildCurve(SLOT, [])
    expect(curve.points).toEqual([])
    expect(curve.priceMoves).toEqual([])
    expect(curve.totals).toEqual({ units: 0, amountCents: 0, unitsReturned: 0 })
    expect(curve.close).toBeNull()
    expect(curve.capacity).toBe(200)
  })
})
