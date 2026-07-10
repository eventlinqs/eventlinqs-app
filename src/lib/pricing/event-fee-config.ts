import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getPricingRule, type PricingReadClient } from '@/lib/payments/pricing-rules'
import type { FeeRates } from '@/lib/payments/fee-math'
import { PUBLIC_PLATFORM_FEE, PUBLIC_PROCESSING_FEE } from './public-fee'

/**
 * Resolves the full set of fee VALUES (both percentages + the platform flat fee)
 * for one event's scope, so the public event page can show the ACCC all-in total
 * BEFORE checkout. Reads the SAME `pricing_rules` rows the charge resolves
 * (event > organiser > region precedence) through the SAME resolver, via the
 * PUBLIC (anon) client - pricing_rules has a public SELECT policy - so it works
 * on every environment without a service-role key and the displayed all-in can
 * never drift from the charged all-in.
 *
 * On any lookup failure it degrades to the reviewed last-resort constants (the
 * locked AU baseline), so the event page never 500s.
 */
export interface EventFeeRatesOptions {
  organisationId?: string | null
  eventId?: string | null
  /** Defaults to AU / AUD, the launch market. */
  countryCode?: string
  currency?: string
}

export async function getEventFeeRates(opts: EventFeeRatesOptions): Promise<FeeRates> {
  const countryCode = opts.countryCode ?? 'AU'
  const currency = opts.currency ?? PUBLIC_PLATFORM_FEE.currency
  const organisationId = opts.organisationId ?? null
  const eventId = opts.eventId ?? null

  let platformFeePercent: number = PUBLIC_PLATFORM_FEE.percent
  let platformFeeFixedCents: number = PUBLIC_PLATFORM_FEE.fixedCents
  let processingFeePercent: number = PUBLIC_PROCESSING_FEE.percent
  let processingFeeFixedCents: number = PUBLIC_PROCESSING_FEE.fixedCents

  try {
    const client = createPublicClient() as unknown as PricingReadClient
    const [pp, pf, rp, rf] = await Promise.all([
      getPricingRule({ ruleType: 'platform_fee_percentage', countryCode, currency, organisationId, eventId }, { client }),
      getPricingRule({ ruleType: 'platform_fee_fixed', countryCode, currency, organisationId, eventId }, { client }),
      getPricingRule({ ruleType: 'processing_fee_percentage', countryCode, currency, organisationId, eventId }, { client }),
      getPricingRule({ ruleType: 'processing_fee_fixed_cents', countryCode, currency, organisationId, eventId }, { client }),
    ])
    platformFeePercent = pp.value
    platformFeeFixedCents = pf.value
    processingFeePercent = rp.value
    processingFeeFixedCents = rf.value
  } catch {
    // Fall back to the reviewed constants; the public page must never 500.
  }

  return { platformFeePercent, platformFeeFixedCents, processingFeePercent, processingFeeFixedCents }
}
