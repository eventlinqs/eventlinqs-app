import {
  getPlatformFeePercentage,
  getPlatformFeeFixedCents,
  getProcessingFeePassThrough,
  type ProcessingFeePassThrough,
} from './pricing-rules'
import { computeFeeLineCents, computeAllInTotalCents } from './fee-math'
import { applyFoundingWaiver, getFoundingWaiver, type OrganisationReadClient } from './founding-waiver'
import { createAdminClient } from '@/lib/supabase/admin'

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
   * @param organisationId Resolves a per-organiser fee override when set.
   * @param eventId Resolves a per-event fee override (highest precedence) when
   *   set, so an event with its own fee is charged exactly that fee.
   */
  async calculate(
    tickets: CartItem[],
    addons: CartAddon[],
    currency: string,
    fee_pass_type?: FeePassType,
    discount_cents: number = 0,
    organisationId?: string | null,
    eventId?: string | null
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
    const evId = eventId ?? null

    /*
     * ONE FEE. The processing percentage and its flat component are no longer
     * READ, which is what makes the `processing_fee_percentage` and
     * `processing_fee_fixed_cents` rows in `pricing_rules` INERT rather than
     * requiring a migration to remove them. Nothing resolves them, so nothing
     * can be surprised by them.
     *
     * ONE-FEE-ALLOW-BEGIN: explains the misnomer, which requires stating what
     * the rule used to cover.
     * `processing_fee_pass_through` is STILL read, and the name is now a
     * misnomer worth flagging rather than renaming under launch pressure: that
     * rule has always governed whether BOTH fees are passed to the buyer or
     * absorbed by the organiser, not just the processing one. Renaming it means
     * a migration and a coordinated deploy, which is exactly the risk this
     * change is avoiding. It is read here, once, and its meaning is stated.
     * ONE-FEE-ALLOW-END
     */
    const [platformFeePercent, platformFeeFixedCents, passThroughDefault] = await Promise.all([
      getPlatformFeePercentage(country, currency, orgId, evId),
      getPlatformFeeFixedCents(country, currency, orgId, evId),
      getProcessingFeePassThrough(country, currency, orgId, evId),
    ])

    // The FOUNDING ORGANISER WAIVER. Applied here, at the charge authority, so
    // checkout, capture and payout all inherit it: the payout path composes the
    // application fee from the fee amounts STORED on the order, so a waived
    // charge is a waived payout without a second lookup.
    //
    // ONE-FEE-ALLOW-BEGIN: contrasts the current anchor with the superseded one.
    // The platform fee goes to zero inside the window. With one fee, a waived
    // ticket is now genuinely free of platform charge: a 20.00 ticket inside the
    // window is 20.00 all in, where under the two-fee model it was 20.50 because
    // the processing line was never waived.
    // ONE-FEE-ALLOW-END
    // On any lookup failure the waiver
    // reads INACTIVE, so an error charges the standard rate rather than silently
    // giving the fee away.
    // The client is built ONLY when there is an organisation to look up. A
    // null orgId needs no query, so the no-organisation path never constructs
    // a service-role client at all. Building it unconditionally was wasteful
    // in production (a second admin client per calculate(), on top of the one
    // getPricingRule already makes) and it reached around the module boundary
    // the unit tests mock, which is what turned 11 green tests red the moment
    // the ambient env went away.
    const waiver = orgId
      ? await getFoundingWaiver(createAdminClient() as unknown as OrganisationReadClient, orgId)
      : { feeFreeUntil: null, active: false }
    const waivedRates = applyFoundingWaiver(
      { platformFeePercent, platformFeeFixedCents },
      waiver.active,
    )

    const ticketCount = tickets.reduce((sum, t) => sum + t.quantity, 0)

    // Single source of fee arithmetic (src/lib/payments/fee-math.ts): the SAME
    // pure function powers the ACCC all-in display on the ticket selector, so
    // the total the buyer is shown can never diverge from the total charged.
    const { platform_fee_cents, payment_processing_fee_cents } = computeFeeLineCents(
      discounted_subtotal,
      ticketCount,
      waivedRates,
    )
    // GST is inclusive in EventLinqs all-in pricing (all-in pricing shown from
    // the first click, no hidden fees). Funds-holding model + founder GST ruling
    // (Option 1, limited payment collection agent): EventLinqs is the PAYMENTS
    // merchant of record (separate charges and transfers) but acts as the
    // organiser's limited collection agent for tax, so the ORGANISER remains the
    // seller of the ticket and remits GST on the ticket face value, while
    // EventLinqs remits GST on its own fee (one eleventh of the fee). The ticket
    // face value and the platform fee are GST-inclusive, so a separate GST amount
    // is never added on top of the buyer total. Adding 10 per cent of the ticket
    // subtotal here was the over-charge this line exists to prevent.
    //
    // THE EVIDENCE, corrected 15 August 2026 after a read-only check of both
    // databases, because the original note cited an order nobody can look up and
    // a percentage that overstated the fault.
    //
    //   - Order EL-6HBNEYY9 does NOT EXIST on production or on TEST. Production
    //     holds exactly one order and TEST holds 120; neither includes it. It
    //     came from a database state that has since been reseeded, so the
    //     reference is unverifiable and must not be quoted as if it were live.
    //   - The surviving specimen is EL-NGEBXWUZ on production, 28 May 2026:
    //     subtotal 8500, fees 263 + 277, tax_cents 850, total 9890. The 850 is
    //     the defect, and it is exactly 10 per cent of the subtotal.
    //   - THE OVER-CHARGE WAS 9.4 PER CENT, not 16.6. The buyer would have paid
    //     9890 against a correct 9040. The 16.6 figure was total-versus-FACE
    //     VALUE, which folds the legitimate fees into the error and overstates
    //     it by nearly double.
    //   - NO MONEY EVER MOVED. That order is `pending`, its payment is
    //     `initiated` with a null gateway_payment_id and a null completed_at,
    //     and no ticket was issued. Nothing is owed and no refund is required.
    //
    // A tax-exclusive jurisdiction (for example US sales tax added at the
    // till) would need an explicit inclusive vs exclusive tax mode. None is
    // active today, so no consumption tax is added to the all-in total.
    const tax_cents = 0

    const resolvedPassType: FeePassType = fee_pass_type ?? passThroughToFeePassType(passThroughDefault)

    // Same shared pure helper the client all-in display uses, so charged ==
    // shown. In absorb mode the buyer pays the subtotal only (the fees come out
    // of the organiser payout); in pass-on the fees are added on top.
    const total_cents = computeAllInTotalCents(
      discounted_subtotal,
      { platform_fee_cents, payment_processing_fee_cents },
      resolvedPassType,
      tax_cents,
    )
    const processingFeeShownToBuyer = resolvedPassType === 'absorb' ? 0 : payment_processing_fee_cents
    const platformFeeShownToBuyer = resolvedPassType === 'absorb' ? 0 : platform_fee_cents

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
