/**
 * DYNAMIC PRICING STEPS, NORMALISED IN ONE PLACE.
 *
 * The organiser's screen lets steps be typed in any order and lets two steps
 * carry the same threshold. get_current_tier_price picks the LOWEST threshold at
 * or above the percent sold, so the order a person typed them in never decides
 * the price; the thresholds do. This makes the stored shape say exactly that:
 * sorted by threshold, renumbered from 1, thresholds held to 1 to 100 with two
 * decimals, prices to whole cents at zero or more, and a duplicated threshold
 * resolved in favour of the LAST one typed (the organiser's most recent intent).
 *
 * Used by the save action before it calls save_dynamic_pricing, and pinned by
 * tests/unit/pricing/dynamic-pricing-steps.test.ts.
 */

export interface DynamicPricingStepInput {
  step_order?: number
  capacity_threshold_percent: number
  price_cents: number
}

export interface DynamicPricingStep {
  step_order: number
  capacity_threshold_percent: number
  price_cents: number
}

export const MAX_DYNAMIC_PRICING_STEPS = 10

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 100
  const rounded = Math.round(value * 100) / 100
  return Math.min(100, Math.max(1, rounded))
}

function clampPrice(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

export function normaliseDynamicPricingSteps(steps: DynamicPricingStepInput[]): DynamicPricingStep[] {
  const byThreshold = new Map<number, number>()
  for (const step of steps) {
    // A later duplicate replaces an earlier one: Map.set keeps the key's first
    // insertion position, so the sort below decides the order regardless.
    byThreshold.set(clampThreshold(step.capacity_threshold_percent), clampPrice(step.price_cents))
  }
  return [...byThreshold.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_DYNAMIC_PRICING_STEPS)
    .map(([capacity_threshold_percent, price_cents], i) => ({
      step_order: i + 1,
      capacity_threshold_percent,
      price_cents,
    }))
}
