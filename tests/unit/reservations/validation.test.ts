import { describe, expect, test } from 'vitest'
import {
  CreateReservationSchema,
  MAX_QTY_HARD_CAP,
  checkMaxPerOrder,
  summariseIssues,
} from '@/lib/reservations/validation'

const EVENT = '11111111-1111-4111-8111-111111111111'
const TIER = '22222222-2222-4222-8222-222222222222'

describe('RES-01: server quantity cap aligns with organiser max_per_order', () => {
  test('a selection above the old hard-cap of 20 now passes the schema (regression)', () => {
    // The bug: schema hard-capped quantity at 20 while the client stepper
    // clamps to max_per_order. A tier with max_per_order=30 + qty 25 used to
    // fail safeParse -> "Invalid reservation data". It must now parse.
    const parsed = CreateReservationSchema.safeParse({
      event_id: EVENT,
      ticket_items: [{ ticket_tier_id: TIER, quantity: 25 }],
    })
    expect(parsed.success).toBe(true)
  })

  test('the abuse ceiling still rejects an absurd quantity', () => {
    const parsed = CreateReservationSchema.safeParse({
      event_id: EVENT,
      ticket_items: [{ ticket_tier_id: TIER, quantity: MAX_QTY_HARD_CAP + 1 }],
    })
    expect(parsed.success).toBe(false)
  })

  test('checkMaxPerOrder allows quantity equal to the tier max_per_order', () => {
    const r = checkMaxPerOrder(
      [{ ticket_tier_id: TIER, quantity: 30 }],
      [{ id: TIER, name: 'General Admission', max_per_order: 30 }],
    )
    expect(r.ok).toBe(true)
  })

  test('checkMaxPerOrder rejects over-limit with a precise, tier-named message', () => {
    const r = checkMaxPerOrder(
      [{ ticket_tier_id: TIER, quantity: 31 }],
      [{ id: TIER, name: 'General Admission', max_per_order: 30 }],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('You can buy at most 30 General Admission per order.')
      // Never the opaque generic string.
      expect(r.error).not.toMatch(/invalid reservation data/i)
    }
  })

  test('checkMaxPerOrder skips unknown tiers (left for the DB RPC) and null limits', () => {
    expect(
      checkMaxPerOrder(
        [{ ticket_tier_id: TIER, quantity: 99 }],
        [],
      ).ok,
    ).toBe(true)
    expect(
      checkMaxPerOrder(
        [{ ticket_tier_id: TIER, quantity: 99 }],
        [{ id: TIER, name: 'GA', max_per_order: null }],
      ).ok,
    ).toBe(true)
  })
})

describe('RES-02: invalid input is summarised for the server log', () => {
  test('summariseIssues names the offending field path and code', () => {
    const parsed = CreateReservationSchema.safeParse({
      event_id: 'not-a-uuid',
      ticket_items: [],
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const summary = summariseIssues(parsed.error.issues)
      expect(summary).toMatch(/event_id/)
      expect(summary).toMatch(/ticket_items/)
    }
  })
})
