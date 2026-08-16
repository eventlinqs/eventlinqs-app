import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getPricingRule, type PricingReadClient } from '@/lib/payments/pricing-rules'
import type { FeeRates } from '@/lib/payments/fee-math'
import {
  applyFoundingWaiver,
  getFoundingWaiver,
  type OrganisationReadClient,
} from '@/lib/payments/founding-waiver'
import { PUBLIC_PLATFORM_FEE } from './public-fee'

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

  // ONE FEE (founder ruling 15 August 2026). The processing rules are no longer
  // resolved anywhere, which is what leaves those pricing_rules rows inert
  // rather than requiring a migration to remove them.
  let platformFeePercent: number = PUBLIC_PLATFORM_FEE.percent
  let platformFeeFixedCents: number = PUBLIC_PLATFORM_FEE.fixedCents

  try {
    const client = createPublicClient() as unknown as PricingReadClient
    const [pp, pf] = await Promise.all([
      getPricingRule({ ruleType: 'platform_fee_percentage', countryCode, currency, organisationId, eventId }, { client }),
      getPricingRule({ ruleType: 'platform_fee_fixed', countryCode, currency, organisationId, eventId }, { client }),
    ])
    platformFeePercent = pp.value
    platformFeeFixedCents = pf.value

    // The FOUNDING ORGANISER WAIVER, applied through the SAME shared function
    // the charge authority uses. Without this the event page would show a
    // platform fee the checkout is not going to charge, which is precisely the
    // display-versus-charge divergence the one-source fee law forbids.
    //
    // Only meaningful when an organisation is in scope. The marketing and legal
    // surfaces call getEventFeeRates({}) with no organisation, so they keep
    // showing the standard public rates, which is correct: those pages describe
    // the platform's rates, not one organiser's deal.
    if (organisationId) {
      const waiver = await getFoundingWaiver(
        client as unknown as OrganisationReadClient,
        organisationId,
      )
      const waived = applyFoundingWaiver({ platformFeePercent, platformFeeFixedCents }, waiver.active)
      platformFeePercent = waived.platformFeePercent
      platformFeeFixedCents = waived.platformFeeFixedCents
    }
  } catch {
    // Fall back to the reviewed constants; the public page must never 500.
  }

  return { platformFeePercent, platformFeeFixedCents }
}
