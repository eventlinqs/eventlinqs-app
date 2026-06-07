import 'server-only'
import { getPlatformFeePercentage, getPlatformFeeFixedCents } from '@/lib/payments/pricing-rules'
import { PUBLIC_PLATFORM_FEE } from './public-fee'

/**
 * The ONE public fee number, read live from `pricing_rules` (AU / AUD) - the
 * SAME source the payment calculator charges from - with the reviewed
 * `public-fee.ts` constant as a safe fallback so a public marketing page never
 * 500s on a pricing-rules lookup.
 *
 * This closes the displayed-vs-charged drift: when the founder sets the platform
 * fee in the admin panel, both the charge (payment-calculator) and the public
 * display (this helper) move together, because both read pricing_rules AU/AUD.
 * Server-only (uses the service-role pricing-rules reader).
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

export async function getLivePublicFee(): Promise<LivePublicFee> {
  let percent: number = PUBLIC_PLATFORM_FEE.percent
  let fixedCents: number = PUBLIC_PLATFORM_FEE.fixedCents
  let source: 'live' | 'fallback' = 'fallback'
  try {
    const [p, f] = await Promise.all([
      getPlatformFeePercentage('AU', 'AUD'),
      getPlatformFeeFixedCents('AU', 'AUD'),
    ])
    if (Number.isFinite(p) && Number.isFinite(f) && p >= 0 && f >= 0) {
      percent = p
      fixedCents = f
      source = 'live'
    }
  } catch {
    // Fall back to the reviewed constant; the public page must never 500 on a
    // pricing-rules lookup. The fallback equals the documented baseline.
  }
  const currency = PUBLIC_PLATFORM_FEE.currency
  // Trim a trailing ".0" so 2.0 reads as "2%" (matches the founder's "2%").
  const percentLabel = `${Number(percent.toFixed(2))}%`
  const fixedLabel = `${currency} ${(fixedCents / 100).toFixed(2)}`
  return { percent, fixedCents, currency, percentLabel, fixedLabel, label: `${percentLabel} + ${fixedLabel}`, source }
}
