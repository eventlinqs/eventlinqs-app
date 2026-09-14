'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { forecast } from '@/lib/forecast/arithmetic'
import { methodOf } from '@/lib/forecast/method'
import { readForecastOptions } from '@/lib/forecast/read'
import { storeForecastRun } from '@/lib/forecast/store'
import { EMAIL_CONSENT_TEXT } from '@/lib/forecast/present'
import { SHAPE_COOKIE, SHAPE_COOKIE_MAX_AGE_SECONDS, encodeShape, shapeIsEmpty } from '@/lib/forecast/shape-cookie'
import { ARRIVAL_COOKIE, decodeArrival } from '@/lib/growth/arrival'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import type { FeePassType } from '@/lib/payments/fee-math'

/**
 * RUNNING THE FORECAST, AND KEEPING THE RUN.
 *
 * Close-out FT1. A server action rather than a plain GET form, for one reason
 * that matters: FT1 point 5 says every run is stored, and a GET that stores
 * would write a row every time a crawler, a refresh or a shared link rendered
 * the page. A submit is a run; a render is not.
 *
 * It then REDIRECTS to the result on the query string, so the result is
 * shareable, back-button-safe and rendered by a server component with no
 * client JavaScript, which is what keeps a marketing page inside the mobile
 * performance budget.
 *
 * NO ACCOUNT, NO EMAIL, NO WALL. FT1 point 7. The address is optional, is taken
 * under wording that is stored with it, and the database refuses the row if the
 * wording is missing.
 */

function integer(value: FormDataEntryValue | null, max: number): number {
  const n = Number.parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}

/** Dollars in the form, cents everywhere else. One conversion, one place. */
function dollarsToCents(value: FormDataEntryValue | null): number {
  const n = Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.round(n * 100), 100_000_000)
}

function text(value: FormDataEntryValue | null, max = 64): string | null {
  const clean = String(value ?? '').trim().slice(0, max)
  return clean.length > 0 ? clean : null
}

export async function runForecast(formData: FormData): Promise<void> {
  /*
   * RATE LIMITED, because it is an unauthenticated endpoint that writes a row
   * and can be asked to do so as fast as a script can post. The policy is the
   * shared one; a refusal returns the person to the form rather than an error
   * page, because a marketing tool must not show a stranger a stack of numbers
   * about how often they pressed a button.
   */
  const limited = await applyRateLimit('forecast-run', await headersRequest())
  if (limited) redirect('/forecast?busy=1')

  const capacity = integer(formData.get('capacity'), 1_000_000)
  const ticketPriceCents = dollarsToCents(formData.get('price'))
  const costsCents = dollarsToCents(formData.get('costs'))
  const daysUntilEvent = integer(formData.get('days'), 3650)
  const feePassType: FeePassType = formData.get('feePassType') === 'absorb' ? 'absorb' : 'pass_to_buyer'
  const eventType = text(formData.get('eventType'))
  const citySlug = text(formData.get('city'))
  const ranBefore = formData.get('ranBefore')
  const hasRunAnEventBefore = ranBefore === 'yes' ? true : ranBefore === 'no' ? false : null
  const email = text(formData.get('email'), 254)

  const options = await readForecastOptions()
  const input = { capacity, ticketPriceCents, costsCents, daysUntilEvent, feePassType }
  const result = forecast(input, options.rates)
  const method = methodOf(result)

  const store = await cookies()
  const arrival = decodeArrival(store.get(ARRIVAL_COOKIE)?.value ?? null)

  await storeForecastRun({
    input,
    result,
    method,
    rates: options.rates,
    currency: options.currency,
    eventType,
    citySlug,
    hasRunAnEventBefore,
    src: arrival.src,
    referrerHost: arrival.referrerHost,
    email,
    emailConsentText: email ? EMAIL_CONSENT_TEXT : null,
  })

  /*
   * THE SHAPE, CARRIED. Set here rather than on the link, because a link cannot
   * set a cookie and a query parameter does not survive the emailed signup
   * confirmation. See src/lib/forecast/shape-cookie.ts for why it is a cookie
   * and not a `next`.
   */
  const shape = { categoryId: eventType, city: citySlug, capacity, priceCents: ticketPriceCents }
  if (!shapeIsEmpty(shape)) {
    store.set(SHAPE_COOKIE, encodeShape(shape), {
      // httpOnly, because nothing in the browser reads it: the create-event
      // page reads it on the server. It holds no secret, and a smaller surface
      // for no cost is still the right default.
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SHAPE_COOKIE_MAX_AGE_SECONDS,
    })
  }

  const params = new URLSearchParams({
    capacity: String(capacity),
    price: String(ticketPriceCents),
    costs: String(costsCents),
    days: String(daysUntilEvent),
    fee: feePassType,
  })
  if (eventType) params.set('eventType', eventType)
  if (citySlug) params.set('city', citySlug)
  if (hasRunAnEventBefore !== null) params.set('ranBefore', hasRunAnEventBefore ? 'yes' : 'no')
  if (email) params.set('sent', '1')
  redirect(`/forecast?${params.toString()}#result`)
}

/**
 * The request shape the shared limiter wants. It reads an address off the
 * headers, and a server action has headers without having a Request.
 */
async function headersRequest(): Promise<Request> {
  const h = await headers()
  return new Request('https://forecast.local/run', { headers: h })
}
