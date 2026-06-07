import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PUBLIC_PLATFORM_FEE } from './public-fee'

/**
 * The ONE public fee number, read live from `pricing_rules` (AU / AUD, falling
 * back to the GLOBAL baseline) - the SAME rows the payment calculator charges
 * from - with the reviewed `public-fee.ts` constant as a final safe fallback so
 * a public marketing page never 500s on a pricing-rules lookup.
 *
 * Reads via the PUBLIC (anon) client: pricing_rules has a public SELECT RLS
 * policy ("readable by everyone", needed for fee calculation), so no service-role
 * key is required - this works on every environment, including previews without
 * the service key. The resolution (region -> GLOBAL, active window, highest
 * version) mirrors selectActiveRule in payment/pricing-rules.ts, so the displayed
 * fee equals the charged fee: change pricing_rules in the admin panel and both
 * move together.
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

type Supa = ReturnType<typeof createPublicClient>

async function readActiveValue(
  supa: Supa,
  ruleType: 'platform_fee_percentage' | 'platform_fee_fixed',
): Promise<number | null> {
  const nowIso = new Date().toISOString()
  // AU region first, then the GLOBAL baseline - same precedence as the charger.
  for (const country of ['AU', 'GLOBAL']) {
    const { data, error } = await supa
      .from('pricing_rules')
      .select('value_percentage, value_cents, version')
      .eq('rule_type', ruleType)
      .eq('country_code', country)
      .eq('currency', 'AUD')
      .lte('effective_from', nowIso)
      .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle<{ value_percentage: number | null; value_cents: number | null }>()
    if (error || !data) continue
    const v = ruleType === 'platform_fee_percentage' ? data.value_percentage : data.value_cents
    if (v !== null && v !== undefined && Number.isFinite(v) && v >= 0) return v
  }
  return null
}

export async function getLivePublicFee(): Promise<LivePublicFee> {
  let percent: number = PUBLIC_PLATFORM_FEE.percent
  let fixedCents: number = PUBLIC_PLATFORM_FEE.fixedCents
  let source: 'live' | 'fallback' = 'fallback'
  try {
    const supa = createPublicClient()
    const [p, f] = await Promise.all([
      readActiveValue(supa, 'platform_fee_percentage'),
      readActiveValue(supa, 'platform_fee_fixed'),
    ])
    if (p !== null && f !== null) {
      percent = p
      fixedCents = f
      source = 'live'
    }
  } catch {
    // Fall back to the reviewed constant; the public page must never 500.
  }
  const currency = PUBLIC_PLATFORM_FEE.currency
  // Trim a trailing ".0" so 2.0 reads as "2%".
  const percentLabel = `${Number(percent.toFixed(2))}%`
  const fixedLabel = `${currency} ${(fixedCents / 100).toFixed(2)}`
  return { percent, fixedCents, currency, percentLabel, fixedLabel, label: `${percentLabel} + ${fixedLabel}`, source }
}
