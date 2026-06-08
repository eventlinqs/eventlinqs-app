import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getPricingRule, type PricingReadClient } from '@/lib/payments/pricing-rules'
import { PUBLIC_PLATFORM_FEE } from './public-fee'

/**
 * The ONE public fee number, resolved through the SAME resolver
 * (`getPricingRule`) the payment calculator and payout path use - so the
 * displayed fee can never drift from the charged fee. With no options it
 * resolves the AU / AUD region default (the public marketing number); pass an
 * organisationId or eventId to resolve that scope's real fee for a specific
 * organiser or event, exactly as it will be charged.
 *
 * Reads via the PUBLIC (anon) client: pricing_rules has a public SELECT RLS
 * policy ("readable by everyone", needed for fee calculation), so no
 * service-role key is required and this works on every environment, including
 * previews without the service key. The reviewed `public-fee.ts` constant is
 * the final safe fallback so a public marketing page never 500s on a
 * pricing-rules lookup.
 */
export interface LivePublicFee {
  percent: number
  fixedCents: number
  currency: string
  percentLabel: string
  fixedLabel: string
  /** e.g. "2% + AUD 0.50" */
  label: string
  source: 'live' | 'fallback'
}

export interface LivePublicFeeOptions {
  /** Resolve a per-organiser override. */
  organisationId?: string | null
  /** Resolve a per-event override (highest precedence). */
  eventId?: string | null
  /** Defaults to AU / AUD, the public marketing scope. */
  countryCode?: string
  currency?: string
}

export async function getLivePublicFee(opts?: LivePublicFeeOptions): Promise<LivePublicFee> {
  const countryCode = opts?.countryCode ?? 'AU'
  const currency = opts?.currency ?? PUBLIC_PLATFORM_FEE.currency
  const organisationId = opts?.organisationId ?? null
  const eventId = opts?.eventId ?? null

  let percent: number = PUBLIC_PLATFORM_FEE.percent
  let fixedCents: number = PUBLIC_PLATFORM_FEE.fixedCents
  let source: 'live' | 'fallback' = 'fallback'
  try {
    const client = createPublicClient() as unknown as PricingReadClient
    const [p, f] = await Promise.all([
      getPricingRule(
        { ruleType: 'platform_fee_percentage', countryCode, currency, organisationId, eventId },
        { client }
      ),
      getPricingRule(
        { ruleType: 'platform_fee_fixed', countryCode, currency, organisationId, eventId },
        { client }
      ),
    ])
    percent = p.value
    fixedCents = f.value
    source = 'live'
  } catch {
    // Fall back to the reviewed constant; the public page must never 500.
  }
  // Trim a trailing ".0" so 2.0 reads as "2%".
  const percentLabel = `${Number(percent.toFixed(2))}%`
  const fixedLabel = `${currency} ${(fixedCents / 100).toFixed(2)}`
  return { percent, fixedCents, currency, percentLabel, fixedLabel, label: `${percentLabel} + ${fixedLabel}`, source }
}
