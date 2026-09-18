import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import { captureException } from '@/lib/observability/sentry'
import type { FeeRates } from '@/lib/payments/fee-math'

/**
 * WHAT THE FORECAST PAGE READS, AND THE FACT THAT IT READS ALL OF IT.
 *
 * Close-out FT1 points 2 and 3: the event type comes from "the platform's own
 * community taxonomy (C18 FINAL, read from the database, never typed)", and the
 * fee comes from the fee configuration, "never typed". So this module is the
 * only place the page gets a list or a rate, and it holds neither.
 *
 * THROUGH THE PUBLIC (ANON) CLIENT, not the service role, and that is a
 * deliberate constraint rather than a convenience. `/forecast` is a page a
 * stranger reaches with no account, so everything it renders must be readable
 * by a stranger. Using the service role here would let the page quietly render
 * something the anon key cannot see, and the first person to notice would be a
 * visitor on production seeing an empty list.
 *
 * EVERY READ FAILS SOFT, and says so through `degraded`. A taxonomy read that
 * fails must not 500 a marketing page; it must render a page that still works
 * with a shorter list, and it must be legible to the drive that it did.
 */

export interface ForecastOptions {
  /** The event types, from the taxonomy, in the order the database returns. */
  eventTypes: { slug: string; name: string }[]
  /** The cities, from the cities table. */
  cities: { slug: string; name: string; state: string }[]
  /** The rates the arithmetic runs with, resolved through the one resolver. */
  rates: FeeRates
  currency: string
  /** Where the rate came from, so the page and the drive can both see it. */
  rateSource: 'live' | 'fallback'
  /** True when a read failed and the page is rendering on less than it wanted. */
  degraded: boolean
}

export async function readForecastOptions(): Promise<ForecastOptions> {
  let eventTypes: ForecastOptions['eventTypes'] = []
  let cities: ForecastOptions['cities'] = []
  let degraded = false

  try {
    const supabase = createPublicClient()
    const [categoryResult, cityResult] = await Promise.all([
      supabase
        .from('event_categories')
        .select('slug, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cities')
        .select('slug, name, state')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ])
    if (categoryResult.error) throw categoryResult.error
    if (cityResult.error) throw cityResult.error
    eventTypes = (categoryResult.data ?? []).filter(r => r.slug && r.name)
    cities = (cityResult.data ?? []).filter(r => r.slug && r.name)
  } catch (error) {
    captureException(error, { where: 'lib/forecast/read:taxonomy' })
    degraded = true
  }

  const fee = await getLivePublicFee()
  if (fee.source === 'fallback') degraded = true

  return {
    eventTypes,
    cities,
    rates: { platformFeePercent: fee.percent, platformFeeFixedCents: fee.fixedCents },
    currency: fee.currency,
    rateSource: fee.source,
    degraded,
  }
}
