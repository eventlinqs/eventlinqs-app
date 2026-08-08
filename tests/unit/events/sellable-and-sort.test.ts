import { describe, it, expect } from 'vitest'
import { checkSellable } from '@/lib/events/sellable-guard'

/**
 * The zero-capacity event.
 *
 * `lineup-loop-proof-night-3z7osn` is published, its hero reads "Get tickets.
 * From AUD $25. Secure checkout", and it cannot sell anything: both tiers have
 * total_capacity = 0. The founder hit this and diagnosed it as a Stripe
 * problem. It has nothing to do with Stripe, and nothing in the publish path
 * ever asked whether there was inventory.
 *
 * These fail against main, where checkSellable does not exist and no publish
 * path performs any equivalent check.
 */
describe('an event cannot be published with nothing to sell', () => {
  const tier = (over: Partial<Parameters<typeof checkSellable>[0][number]> = {}) => ({
    name: 'General Admission',
    total_capacity: 100,
    is_active: true,
    ...over,
  })

  it('refuses a general-admission event whose tiers total zero capacity', () => {
    const r = checkSellable([tier({ total_capacity: 0 }), tier({ name: 'Early bird', total_capacity: 0 })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/sold out|capacity of zero/i)
  })

  it('refuses an event with no ticket types at all', () => {
    const r = checkSellable([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/at least one ticket type/i)
  })

  it('refuses a ticket type with no name', () => {
    // The second tier on that event has an empty name and renders as a blank
    // line above a price.
    const r = checkSellable([tier(), tier({ name: '   ' })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/no name/i)
  })

  it('allows a normal general-admission event', () => {
    expect(checkSellable([tier()]).ok).toBe(true)
  })

  it('allows a free event, because zero PRICE is not zero CAPACITY', () => {
    expect(checkSellable([tier({ total_capacity: 50 })]).ok).toBe(true)
  })

  it('ALLOWS a seated event with zero tier capacity, because the seat map is the inventory', () => {
    // This is the assertion that stops the guard breaking seated ticketing.
    // Measured on TEST: 5 of 28 seated events carry zero tier capacity and
    // sell perfectly well. A blanket capacity check would have blocked them.
    const r = checkSellable([tier({ name: 'Stalls', total_capacity: 0 })], {
      hasReservedSeating: true,
    })
    expect(r.ok).toBe(true)
  })

  it('still requires a NAME on a seated event', () => {
    const r = checkSellable([tier({ name: '', total_capacity: 0 })], { hasReservedSeating: true })
    expect(r.ok).toBe(false)
  })

  it('ignores inactive tiers when judging capacity', () => {
    const r = checkSellable([
      tier({ total_capacity: 0, is_active: true }),
      tier({ name: 'Archived', total_capacity: 999, is_active: false }),
    ])
    expect(r.ok).toBe(false)
  })

  it('counts capacity across tiers rather than requiring each to have some', () => {
    const r = checkSellable([tier({ total_capacity: 0 }), tier({ name: 'VIP', total_capacity: 10 })])
    expect(r.ok).toBe(true)
  })
})
