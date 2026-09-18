import 'server-only'
import { cookies } from 'next/headers'
import { afterResponse } from '@/lib/after-response'
import { captureException } from '@/lib/observability/sentry'
import { CLICK_COOKIE, CLICK_QUERY_COOKIE, readClickCookie } from './cookie'
import { recordOrderSignal } from './record'
import { resolveAndStoreOrder } from './store'

/**
 * THE ORDER SIDE CAPTURE, at the point lane B already owns.
 *
 * Called from the checkout action immediately after the marketing consent
 * record, which is where lane B already writes and which GA1 established. The
 * payment intent, the Stripe call, the refund path, the slot ledger and the
 * connected account are untouched by this and are lane A's.
 *
 * IT IS THE ONE PLACE THE TWO CARRIERS ARE READ. `el_click` is the identifier
 * the /m redirect handed out; `el_click_q` is one that travelled in an address
 * and was relayed by the page. Both are read here, both are stored, and the
 * resolver decides which rung they buy.
 *
 * NEVER THROWS. A purchase does not fail because attribution could not be
 * recorded. When nothing is recorded the resolver still has the identity rung,
 * which is exactly what it is for.
 *
 * THE RESOLUTION RUNS AFTER THE RESPONSE, AND THE ORDER OF THE TWO MATTERS.
 * The signal is written INSIDE the request, because the cookies only exist
 * there, and it is one upsert. The resolution is handed to `afterResponse`,
 * because it is six reads and the buyer is not waiting on history about their
 * own purchase. Written this way round, the resolver always finds the signal
 * that the same call just wrote.
 *
 * WHY EVERY ORDER IS RESOLVED HERE AND NOT AT CONFIRMATION. GA3's invariant is
 * one record per order, never zero, INCLUDING the orders that never confirm. An
 * order resolved only on confirmation would leave every abandoned checkout with
 * no record at all, and the guard that checks the invariant would go red on the
 * first one. Whether the sale completed is a separate question and is answered
 * by `marketing_attribution_invoice_ready`, which joins the order state.
 */
export async function recordClickSignalForOrder(orderId: string): Promise<void> {
  try {
    const jar = await cookies()
    const fromCookie = readClickCookie(jar.get(CLICK_COOKIE)?.value ?? null)
    const fromQuery = readClickCookie(jar.get(CLICK_QUERY_COOKIE)?.value ?? null)
    if (fromCookie || fromQuery) {
      await recordOrderSignal({
        orderId,
        clickIdFromCookie: fromCookie,
        clickIdFromQuery: fromQuery,
        campaignIdFromQuery: null,
        linkCode: null,
        cookiePresent: fromCookie !== null,
      })
    }
    await afterResponse('attribution:resolve-order', () => resolveAndStoreOrder(orderId))
  } catch (error) {
    captureException(error, { where: 'lib/attribution/checkout-signal' })
  }
}
