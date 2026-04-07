import { createClient } from '@/lib/supabase/server'

export interface CartItem {
  tier_id: string
  tier_name: string
  quantity: number
  unit_price_cents: number
}

export interface CartAddon {
  addon_id: string
  addon_name: string
  quantity: number
  unit_price_cents: number
}

export interface FeeBreakdown {
  subtotal_cents: number
  addon_total_cents: number
  platform_fee_cents: number
  payment_processing_fee_cents: number
  tax_cents: number
  discount_cents: number
  total_cents: number
  currency: string
  fee_pass_type: 'absorb' | 'pass_to_buyer'
  breakdown_display: {
    tickets: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    addons: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    subtotal: number
    fees: number
    discount: number
    tax: number
    total: number
  }
}

interface PricingRule {
  id: string
  market_code: string
  event_type: string | null
  organiser_tier: string | null
  platform_fee_percent: number
  platform_fee_fixed_cents: number
  payment_processing_percent: number
  payment_processing_fixed_cents: number
  currency: string
  is_active: boolean
}

interface TaxRule {
  id: string
  country_code: string
  tax_name: string
  tax_percent: number
  applies_to: string
  is_active: boolean
}

export class PaymentCalculator {
  // Fetch the best matching pricing rule from the database
  // Priority: country-specific > event-type-specific > GLOBAL
  private async getPricingRule(currency: string): Promise<PricingRule> {
    const supabase = await createClient()

    // Map currency to market code
    const currencyToMarket: Record<string, string> = {
      AUD: 'AU',
      USD: 'US',
      GBP: 'GB',
      NGN: 'NG',
      GHS: 'GH',
      KES: 'KE',
      ZAR: 'ZA',
    }
    const marketCode = currencyToMarket[currency.toUpperCase()] ?? null

    // Try country-specific rule first
    if (marketCode) {
      const { data } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('market_code', marketCode)
        .eq('is_active', true)
        .is('event_type', null)
        .is('organiser_tier', null)
        .maybeSingle()

      if (data) return data as PricingRule
    }

    // Fall back to GLOBAL
    const { data: globalRule } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('market_code', 'GLOBAL')
      .eq('is_active', true)
      .maybeSingle()

    if (!globalRule) {
      // Hardcode a safe default if no DB rule found (should never happen in prod)
      return {
        id: 'fallback',
        market_code: 'GLOBAL',
        event_type: null,
        organiser_tier: null,
        platform_fee_percent: 5,
        platform_fee_fixed_cents: 50,
        payment_processing_percent: 2.9,
        payment_processing_fixed_cents: 30,
        currency: 'AUD',
        is_active: true,
      }
    }

    return globalRule as PricingRule
  }

  private async getTaxPercent(currency: string): Promise<number> {
    const supabase = await createClient()

    const currencyToCountry: Record<string, string> = {
      AUD: 'AU',
      USD: 'US',
      GBP: 'GB',
    }
    const countryCode = currencyToCountry[currency.toUpperCase()] ?? null
    if (!countryCode) return 0

    const { data } = await supabase
      .from('tax_rules')
      .select('tax_percent')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .maybeSingle()

    return data?.tax_percent ?? 0
  }

  async calculate(
    tickets: CartItem[],
    addons: CartAddon[],
    currency: string,
    fee_pass_type: 'absorb' | 'pass_to_buyer',
    discount_cents: number = 0
  ): Promise<FeeBreakdown> {
    const subtotal_cents = tickets.reduce((sum, t) => sum + t.unit_price_cents * t.quantity, 0)
    const addon_total_cents = addons.reduce((sum, a) => sum + a.unit_price_cents * a.quantity, 0)
    const merch_subtotal = subtotal_cents + addon_total_cents

    // Cap discount at subtotal
    const effective_discount = Math.min(discount_cents, merch_subtotal)
    const discounted_subtotal = merch_subtotal - effective_discount

    // Free events: no fees
    if (merch_subtotal === 0) {
      return {
        subtotal_cents,
        addon_total_cents,
        platform_fee_cents: 0,
        payment_processing_fee_cents: 0,
        tax_cents: 0,
        discount_cents: effective_discount,
        total_cents: 0,
        currency,
        fee_pass_type,
        breakdown_display: {
          tickets: tickets.map(t => ({ name: t.tier_name, qty: t.quantity, unit_price_cents: t.unit_price_cents, line_total_cents: t.unit_price_cents * t.quantity })),
          addons: addons.map(a => ({ name: a.addon_name, qty: a.quantity, unit_price_cents: a.unit_price_cents, line_total_cents: a.unit_price_cents * a.quantity })),
          subtotal: merch_subtotal,
          fees: 0,
          discount: effective_discount,
          tax: 0,
          total: 0,
        },
      }
    }

    const rule = await this.getPricingRule(currency)
    const taxPercent = await this.getTaxPercent(currency)
    const ticketCount = tickets.reduce((sum, t) => sum + t.quantity, 0)

    // Platform fee: percent of discounted subtotal + fixed per ticket
    const platform_fee_cents = Math.round(
      discounted_subtotal * (rule.platform_fee_percent / 100) +
      ticketCount * rule.platform_fee_fixed_cents
    )

    // Payment processing fee: Stripe pass-through
    const payment_processing_fee_cents = Math.round(
      discounted_subtotal * (rule.payment_processing_percent / 100) +
      rule.payment_processing_fixed_cents
    )

    // Tax on discounted subtotal (not on fees)
    const tax_cents = Math.round(discounted_subtotal * (taxPercent / 100))

    // What buyer pays depends on fee_pass_type
    let total_cents: number
    let fees_shown_to_buyer: number

    if (fee_pass_type === 'absorb') {
      // Organiser absorbs fees — buyer just pays subtotal + tax - discount
      total_cents = discounted_subtotal + tax_cents
      fees_shown_to_buyer = 0
    } else {
      // pass_to_buyer — fees added on top
      total_cents = discounted_subtotal + platform_fee_cents + payment_processing_fee_cents + tax_cents
      fees_shown_to_buyer = platform_fee_cents + payment_processing_fee_cents
    }

    return {
      subtotal_cents,
      addon_total_cents,
      platform_fee_cents,
      payment_processing_fee_cents,
      tax_cents,
      discount_cents: effective_discount,
      total_cents,
      currency,
      fee_pass_type,
      breakdown_display: {
        tickets: tickets.map(t => ({
          name: t.tier_name,
          qty: t.quantity,
          unit_price_cents: t.unit_price_cents,
          line_total_cents: t.unit_price_cents * t.quantity,
        })),
        addons: addons.map(a => ({
          name: a.addon_name,
          qty: a.quantity,
          unit_price_cents: a.unit_price_cents,
          line_total_cents: a.unit_price_cents * a.quantity,
        })),
        subtotal: merch_subtotal,
        fees: fees_shown_to_buyer,
        discount: effective_discount,
        tax: tax_cents,
        total: total_cents,
      },
    }
  }
}
