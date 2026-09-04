import { describe, expect, test } from 'vitest'
import { MAX_DYNAMIC_PRICING_STEPS, normaliseDynamicPricingSteps } from '@/lib/pricing/steps'

/**
 * The shape stored in dynamic_pricing_rules says what get_current_tier_price
 * will do: the LOWEST threshold at or above the percent sold wins, so the
 * order a person typed the steps in never decides the price. Normalising
 * before save_dynamic_pricing makes the stored rows say exactly that.
 */
describe('normaliseDynamicPricingSteps', () => {
  test('sorts by threshold and renumbers step_order from 1', () => {
    const out = normaliseDynamicPricingSteps([
      { step_order: 1, capacity_threshold_percent: 100, price_cents: 6000 },
      { step_order: 2, capacity_threshold_percent: 25, price_cents: 3000 },
      { step_order: 3, capacity_threshold_percent: 50, price_cents: 4000 },
    ])
    expect(out).toEqual([
      { step_order: 1, capacity_threshold_percent: 25, price_cents: 3000 },
      { step_order: 2, capacity_threshold_percent: 50, price_cents: 4000 },
      { step_order: 3, capacity_threshold_percent: 100, price_cents: 6000 },
    ])
  })

  test('a duplicated threshold keeps the price typed last', () => {
    const out = normaliseDynamicPricingSteps([
      { capacity_threshold_percent: 50, price_cents: 4000 },
      { capacity_threshold_percent: 50, price_cents: 4500 },
    ])
    expect(out).toEqual([{ step_order: 1, capacity_threshold_percent: 50, price_cents: 4500 }])
  })

  test('thresholds are held to 1 to 100 with two decimals, prices to whole cents at zero or more', () => {
    const out = normaliseDynamicPricingSteps([
      { capacity_threshold_percent: 0, price_cents: -5 },
      { capacity_threshold_percent: 250, price_cents: 1999.6 },
      { capacity_threshold_percent: 33.333, price_cents: 1000 },
    ])
    expect(out).toEqual([
      { step_order: 1, capacity_threshold_percent: 1, price_cents: 0 },
      { step_order: 2, capacity_threshold_percent: 33.33, price_cents: 1000 },
      { step_order: 3, capacity_threshold_percent: 100, price_cents: 2000 },
    ])
  })

  test('a non-finite threshold lands on 100 and a non-finite price on zero, never NaN in the database', () => {
    const out = normaliseDynamicPricingSteps([{ capacity_threshold_percent: Number.NaN, price_cents: Number.POSITIVE_INFINITY }])
    expect(out).toEqual([{ step_order: 1, capacity_threshold_percent: 100, price_cents: 0 }])
  })

  test('never more than the maximum the schema allows', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ capacity_threshold_percent: 5 + i * 5, price_cents: 1000 + i }))
    const out = normaliseDynamicPricingSteps(many)
    expect(out).toHaveLength(MAX_DYNAMIC_PRICING_STEPS)
    expect(out[out.length - 1].step_order).toBe(MAX_DYNAMIC_PRICING_STEPS)
  })

  test('no steps is no steps', () => {
    expect(normaliseDynamicPricingSteps([])).toEqual([])
  })
})
