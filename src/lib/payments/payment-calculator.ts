import {
  getPlatformFeePercentage,
  getPlatformFeeFixedCents,
  getProcessingFeePercentage,
  getProcessingFeeFixedCents,
  getProcessingFeePassThrough,
  type ProcessingFeePassThrough,
} from './pricing-rules'

/**
 * M6 Phase 3 (rework). PaymentCalculator now reads from the long-format
 * pricing_rules table via the pricing-rules service. The previous wide-format
 * read (market_code, platform_fee_percent, payment_processing_percent) was a
 * latent bug that silently fell back to a hardcoded default in production.
 * Fixed in this rework.
 *
 * Caller-supplied `fee_pass_type`:
 *   - If the caller passes 'absorb' or 'pass_to_buyer' explicitly, that wins
 *     (used by per-event organiser overrides via events.fee_pass_type).
 *   - If undefined, the calculator resolves the default from
 *     pricing_rules.processing_fee_pass_through (region default → 1 = pass).
 */

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

export type FeePassType = 'absorb' | 'pass_to_buyer'

export interface FeeBreakdown {
  subtotal_cents: number
  addon_total_cents: number
  platform_fee_cents: number
  payment_processing_fee_cents: number
  tax_cents: number
  discount_cents: number
  total_cents: number
  currency: string
  fee_pass_type: FeePassType
  breakdown_display: {
    tickets: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    addons: { name: string; qty: number; unit_price_cents: number; line_total_cents: number }[]
    subtotal: number
    platform_fee: number
    processing_fee: number
    discount: number
    tax: number
    total: number
  }
}

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  AUD: 'AU',
  USD: 'US',
  GBP: 'GB',
  EUR: 'IE',
  CAD: 'CA',
  NZD: 'NZ',
  NGN: 'NG',
  GHS: 'GH',
  KES: 'KE',
  ZAR: 'ZA',
}

function countryFromCurrency(currency: string): string {
  return CURRENCY_TO_COUNTRY[currency.toUpperCase()] ?? 'GLOBAL'
}

export class PaymentCalculator {
  /**
   * @param fee_pass_type If supplied, overrides the pricing_rules default.
   *   This is how `events.fee_pass_type` (per-event organiser setting)
   *   propagates into the buyer's fee total.
   */
  async calculate(
    tickets: CartItem[],
    addons: CartAddon[],
    currency: string,
    fee_pass_type?: FeePassType,
    discount_cents: number = 0,
    organisationId?: string | null
  ): Promise<FeeBreakdown> {
    const subtotal_cents = tickets.reduce((sum, t) => sum + t.unit_price_cents * t.quantity, 0)
    const addon_total_cents = addons.reduce((sum, a) => sum + a.unit_price_cents * a.quantity, 0)
    const merch_subtotal = subtotal_cents + addon_total_cents

    const effective_discount = Math.min(discount_cents, merch_subtotal)
    const discounted_subtotal = merch_subtotal - effective_discount

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
        fee_pass_type: fee_pass_type ?? 'pass_to_buyer',
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
          platform_fee: 0,
          processing_fee: 0,
          discount: effective_discount,
          tax: 0,
          total: 0,
        },
      }
    }

    const country = countryFromCurrency(currency)
    const orgId = organisationId ?? null

    const [
      platformFeePercent,
      platformFeeFixedCents,
      processingFeePercent,
      processingFeeFixedCents,
      passThroughDefault,
    ] = await Promise.all([
      getPlatformFeePercentage(country, currency, orgId),
      getPlatformFeeFixedCents(country, currency, orgId),
      getProcessingFeePercentage(country, currency, orgId),
      getProcessingFeeFixedCents(country, currency, orgId),
      getProcessingFeePassThrough(country, currency, orgId),
    ])

    const ticketCount = tickets.reduce((sum, t) => sum + t.quantity, 0)

    const platform_fee_cents = Math.round(
      (discounted_subtotal * platformFeePercent) / 100 + ticketCount * platformFeeFixedCents
    )
    const payment_processing_fee_cents = Math.round(
      (discounted_subtotal * processingFeePercent) / 100 + processingFeeFixedCents
    )
    // GST is inclusive in EventLinqs all-in pricing (platform philosophy:
    // all-in pricing shown from the first click, no hidden fees). In
    // Australia the ticket face value and the platform fee are GST-inclusive:
    // the organiser is merchant of record under destination charges and
    // remits GST on the ticket, and EventLinqs remits GST on its own fee
    // (one eleventh of the fee). A separate GST amount is therefore never
    // added on top of the buyer total. Adding 10 per cent of the ticket
    // subtotal here was the source of the 16.6 per cent over-charge on
    // order EL-6HBNEYY9 (AUD 65 face value billed as AUD 75.82).
    //
    // A tax-exclusive jurisdiction (for example US sales tax added at the
    // till) would need an explicit inclusive vs exclusive tax mode. None is
    // active today, so no consumption tax is added to the all-in total.
    const tax_cents = 0

    const resolvedPassType: FeePassType = fee_pass_type ?? passThroughToFeePassType(passThroughDefault)

    let total_cents: number
    let processingFeeShownToBuyer: number
    let platformFeeShownToBuyer: number

    if (resolvedPassType === 'absorb') {
      total_cents = discounted_subtotal + tax_cents
      processingFeeShownToBuyer = 0
      platformFeeShownToBuyer = 0
    } else {
      total_cents = discounted_subtotal + platform_fee_cents + payment_processing_fee_cents + tax_cents
      processingFeeShownToBuyer = payment_processing_fee_cents
      platformFeeShownToBuyer = platform_fee_cents
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
      fee_pass_type: resolvedPassType,
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
        platform_fee: platformFeeShownToBuyer,
        processing_fee: processingFeeShownToBuyer,
        discount: effective_discount,
        tax: tax_cents,
        total: total_cents,
      },
    }
  }
}

function passThroughToFeePassType(code: ProcessingFeePassThrough): FeePassType {
  // 0 = absorb. 1 = pass to buyer. 2 = split (treated as pass to buyer in the
  // FeeBreakdown surface for now; split-mode UX lands in a future phase).
  return code === 0 ? 'absorb' : 'pass_to_buyer'
}
