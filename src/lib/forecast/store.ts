import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import type { FeeRates } from '@/lib/payments/fee-math'
import type { ForecastInput, ForecastResult } from './arithmetic'
import type { ForecastMethod } from './method'

/**
 * KEEPING THE RUN, so the tool can be judged later and so AN1 can count it.
 *
 * Close-out FT1 point 5. The inputs, the outputs and the SOURCE PARAMETERS,
 * because a stored output computed under a fee rate that has since moved is not
 * wrong, it is historical, and it can only be read that way if the rate it ran
 * under is beside it.
 *
 * BEST EFFORT, ALWAYS. A person who has just used a free tool and is shown an
 * error because telemetry could not be written is a real loss; a missing run is
 * not. Every failure is reported and swallowed, and the caller gets a boolean
 * it is free to ignore.
 *
 * THE EMAIL IS OPTIONAL AND CARRIES ITS OWN WORDS. FT1 point 7: no email is
 * required to see the result, and one given is "stored for the owner's own
 * follow up, never used for a first contact that the organiser did not ask
 * for". The wording they agreed to is stored WITH it, and the database refuses
 * the row otherwise, so there can never be an address on this platform whose
 * consent nobody can produce.
 */

export interface StoreRunInput {
  input: ForecastInput
  result: ForecastResult
  method: ForecastMethod
  rates: FeeRates
  currency: string
  eventType: string | null
  citySlug: string | null
  hasRunAnEventBefore: boolean | null
  src: string | null
  referrerHost: string | null
  email?: string | null
  emailConsentText?: string | null
}

export async function storeForecastRun(params: StoreRunInput): Promise<{ stored: boolean; id: string | null }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('forecast_runs')
      .insert({
        event_type: params.eventType,
        city_slug: params.citySlug,
        capacity: params.input.capacity,
        ticket_price_cents: params.input.ticketPriceCents,
        costs_cents: params.input.costsCents,
        days_until_event: params.input.daysUntilEvent,
        fee_pass_type: params.input.feePassType,
        has_run_an_event_before: params.hasRunAnEventBefore,
        outputs: {
          breakEven: params.result.breakEven,
          foundingBreakEven: params.result.foundingBreakEven,
          scenarios: params.result.scenarios,
          unanswerable: params.result.unanswerable,
        },
        /*
         * WHAT IT WAS RUN WITH. The fee rates by name, the currency, and the
         * method. Not a copy of the whole configuration: the two numbers that
         * changed every figure above.
         */
        source_parameters: {
          platformFeePercent: params.rates.platformFeePercent,
          platformFeeFixedCents: params.rates.platformFeeFixedCents,
          currency: params.currency,
        },
        method: params.method,
        src: params.src,
        referrer_host: params.referrerHost,
        email: params.email ?? null,
        email_consent_text: params.email ? params.emailConsentText ?? null : null,
        email_consent_at: params.email ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error) throw error
    return { stored: true, id: data?.id ?? null }
  } catch (error) {
    captureException(error, { where: 'lib/forecast/store' })
    return { stored: false, id: null }
  }
}
