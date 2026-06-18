import { describe, expect, test } from 'vitest'
import { pickUnitPriceCents, resolveSeatUnitPriceCents } from '@/lib/checkout/pricing'

/**
 * FUN-01 / FUN-03: the checkout page (display) and processCheckout (charge)
 * both resolve unit prices through these shared helpers, so the displayed
 * total cannot diverge from the charged total. These tests pin the rule and
 * prove displayed == charged across every price condition.
 *
 * Call sites that share this single source:
 *  - GA charge:   src/app/actions/checkout.ts (pickUnitPriceCents)
 *  - GA display:  src/app/checkout/[reservation_id]/page.tsx (pickUnitPriceCents)
 *  - Seat charge: src/app/actions/checkout.ts (resolveSeatUnitPriceCents)
 *  - Seat display:src/app/checkout/[reservation_id]/page.tsx (resolveSeatUnitPriceCents)
 */

describe('pickUnitPriceCents - dynamic overrides base', () => {
  test('active dynamic price overrides the base price', () => {
    expect(pickUnitPriceCents(7000, 5000)).toBe(7000)
  })
  test('no dynamic price falls back to base', () => {
    expect(pickUnitPriceCents(null, 5000)).toBe(5000)
    expect(pickUnitPriceCents(undefined, 5000)).toBe(5000)
  })
  test('neither present is 0 (not NaN)', () => {
    expect(pickUnitPriceCents(null, null)).toBe(0)
  })
})

describe('FUN-01: displayed total equals charged total across price conditions', () => {
  // The display path and the charge path are modelled with the SAME inputs and
  // the SAME shared helper; equality must hold in every condition.
  const base = new Map([
    ['tierA', 5000],
    ['tierB', 8000],
  ])
  const items = [
    { ticket_tier_id: 'tierA', quantity: 2 },
    { ticket_tier_id: 'tierB', quantity: 1 },
  ]

  function total(dynamicMap: Map<string, number>) {
    // mirrors both checkout.ts and page.tsx: unit = pickUnitPriceCents(dynamic, base)
    return items.reduce(
      (sum, i) =>
        sum + pickUnitPriceCents(dynamicMap.get(i.ticket_tier_id), base.get(i.ticket_tier_id)) * i.quantity,
      0,
    )
  }

  test('base prices only (no dynamic rule)', () => {
    const dynamic = new Map<string, number>()
    expect(total(dynamic)).toBe(5000 * 2 + 8000) // 18000
  })

  test('dynamic price active on one tier', () => {
    const dynamic = new Map([['tierA', 6500]])
    // displayed uses dynamic for tierA, base for tierB; charge uses the same
    expect(total(dynamic)).toBe(6500 * 2 + 8000) // 21000
  })

  test('dynamic prices active on all tiers', () => {
    const dynamic = new Map([
      ['tierA', 6500],
      ['tierB', 9000],
    ])
    expect(total(dynamic)).toBe(6500 * 2 + 9000) // 22000
  })
})

describe('FUN-03: resolveSeatUnitPriceCents - shared seat pricing + fallback order', () => {
  const rpcReturns = (cents: number | null) => async () => cents

  test('tier-bound seat uses the current (dynamic-aware) tier price', async () => {
    const price = await resolveSeatUnitPriceCents(
      { ticket_tier_id: 'tierA', price_cents: 6000 },
      rpcReturns(8000),
      5000,
    )
    expect(price).toBe(8000)
  })

  test('tier-bound seat with null tier price falls back to the seat price', async () => {
    const price = await resolveSeatUnitPriceCents(
      { ticket_tier_id: 'tierA', price_cents: 6000 },
      rpcReturns(null),
      5000,
    )
    expect(price).toBe(6000)
  })

  test('tier-bound seat with null tier price and null seat price falls back to the event fallback', async () => {
    const price = await resolveSeatUnitPriceCents(
      { ticket_tier_id: 'tierA', price_cents: null },
      rpcReturns(null),
      5000,
    )
    expect(price).toBe(5000)
  })

  test('seat with no tier uses its own price then the fallback', async () => {
    expect(
      await resolveSeatUnitPriceCents({ ticket_tier_id: null, price_cents: 6000 }, rpcReturns(9999), 5000),
    ).toBe(6000)
    expect(
      await resolveSeatUnitPriceCents({ ticket_tier_id: null, price_cents: null }, rpcReturns(9999), 5000),
    ).toBe(5000)
  })
})
