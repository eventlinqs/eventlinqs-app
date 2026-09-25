import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { aggregateGmv } from '@/lib/admin/analytics'

/**
 * ONE EVENT'S REVENUE, COMPUTED ONCE, FOR EVERY ORGANISER SCREEN THAT SHOWS IT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Measured against TEST on 20 September 2026.
 *
 * `RevenueSummary` is rendered on two organiser screens for the SAME event:
 * /dashboard/events/[id]/orders and /dashboard/events/[id]/edit. The orders
 * screen read every order through the pager, counted the three PAID statuses,
 * and subtracted completed refunds. The edit screen did none of that. It ran
 *
 *     .from('orders')
 *     .select('total_cents, platform_fee_cents, processing_fee_cents, currency')
 *     .eq('event_id', id)
 *     .eq('status', 'confirmed')
 *
 * and summed whatever came back. Three independent defects sat in those four
 * lines, and each of them moves the money the organiser reads off the screen:
 *
 * 1. THE STATUS SET WAS WRONG, so the two screens disagree whenever a single
 *    refund exists. An order that is `partially_refunded` is one the organiser
 *    KEPT most of, and `.eq('status','confirmed')` drops it in full. A
 *    `refunded` order is dropped too, so it never appears in gross and its
 *    refund never appears as a deduction. On TEST, event
 *    ea8a167d-95e2-42c6-a391-3ddf96c7d7cf holds one partially_refunded order of
 *    2,687 cents: the orders screen shows Gross AUD 26.87 with the refund on
 *    its own line, and the edit screen showed Gross AUD 0.00. One event, two
 *    screens, two answers, and no way for the organiser to tell which is true.
 *
 * 2. THE READ WAS UNBOUNDED, so it stopped at the project's row ceiling in
 *    silence: "By default, Supabase projects return a maximum of 1,000 rows"
 *    (https://supabase.com/docs/reference/javascript/select, fetched
 *    2026-09-19). HTTP 200, `error` null, a full-looking array. Past a thousand
 *    paid orders every figure on the card was the sum of an arbitrary subset,
 *    and because the query carried no `.order()` at all, WHICH subset was
 *    undefined and free to change between two loads of the same page.
 *
 * 3. THE ERROR WAS DISCARDED. `const { data: revenueData }` with no `error`,
 *    then `revenueData ?? []`. A database that refuses the read renders
 *    Gross AUD 0.00, fees AUD 0.00, Net AUD 0.00 on a sold-out event, which is
 *    a lie the organiser has no way to detect. Every read here throws instead,
 *    so the page answers 500 and the screen is never quietly wrong.
 *
 * ---------------------------------------------------------------------------
 * THE ARITHMETIC IS NOT RE-IMPLEMENTED HERE. Gross, the refund deduction and
 * the paid-order count come from `aggregateGmv`, the audited aggregator
 * /admin/analytics already uses, so the organiser's own screen and the
 * platform's books cannot drift apart by being written twice.
 */

/**
 * The statuses in which a sale actually occurred. `pending`, `cancelled` and
 * `expired` never count. Exported because the set being written out twice, in
 * two files, with two different answers, is defect 1 above.
 */
export const PAID_ORDER_STATUSES = ['confirmed', 'partially_refunded', 'refunded'] as const

/** Exactly the columns this module reads. Nothing here is cast from a wider row. */
export interface EventRevenueOrderRow {
  total_cents: number
  platform_fee_cents: number
  processing_fee_cents: number
  status: string
  currency: string
}

export interface EventRevenueRefundRow {
  amount_cents: number
  status: string
}

export interface EventRevenueSummary {
  grossCents: number
  platformFeeCents: number
  processingFeeCents: number
  refundedCents: number
  netCents: number
  paidOrders: number
  currency: string
}

/**
 * The pure arithmetic. Both screens call this with their own rows, so they
 * cannot disagree about what a refund does to a total.
 *
 * `fallbackCurrency` is used only when no PAID order exists: an event with
 * nothing sold has no currency of its own to report, and the caller knows a
 * better answer (its ticket tiers) than this function does.
 */
export function summariseEventRevenue(
  orders: EventRevenueOrderRow[],
  refunds: EventRevenueRefundRow[],
  fallbackCurrency = 'AUD',
): EventRevenueSummary {
  const paid = orders.filter(o => (PAID_ORDER_STATUSES as readonly string[]).includes(o.status))
  const gmv = aggregateGmv(
    paid.map(o => ({
      total_cents: o.total_cents,
      platform_fee_cents: o.platform_fee_cents,
      status: o.status,
    })),
    refunds,
  )

  /*
   * THE LEGACY COLUMN IS SUMMED OVER THE SAME SET, not over a set of its own.
   *
   * There is ONE fee, and `processing_fee_cents` is not a second one: since the
   * founder's ruling of 15 August 2026 every new order writes 0 into it. Orders
   * written BEFORE that ruling carry a non-zero value that was part of the
   * platform's single take at the time, so it is still added to
   * platform_fee_cents and still shown as the one fee line the organiser reads
   * (src/components/orders/revenue-summary.tsx). It is not in `aggregateGmv`
   * because the platform's own books have no use for it. Summing it over a
   * different status set to the one gross uses is how the card stops adding up.
   */
  const processingFeeCents = paid.reduce((s, o) => s + Number(o.processing_fee_cents ?? 0), 0)

  return {
    grossCents: gmv.grossGmvCents,
    platformFeeCents: gmv.platformRevenueCents,
    processingFeeCents,
    refundedCents: gmv.refundedCents,
    netCents: gmv.netGmvCents,
    paidOrders: gmv.paidOrders,
    currency: paid[0]?.currency ?? fallbackCurrency,
  }
}

/**
 * Read one event's revenue in full and summarise it.
 *
 * Every read pages through `readEveryRow`, which throws rather than returning
 * the part it managed to collect, so a caller gets the whole answer or an
 * exception. There is no third outcome in which the card renders a smaller
 * number than the truth.
 *
 * @param client AN ADMIN CLIENT, and the reason is measured rather than
 *   assumed. The organiser's own session cannot read `refunds` at all: the
 *   permissive policy "Admins read all refunds" evaluates
 *   `EXISTS (SELECT 1 FROM admin_users ...)`, and `admin_users`' own SELECT
 *   policy selects from `admin_users`, so PostgreSQL answers 42P17 "infinite
 *   recursion detected in policy for relation admin_users" to EVERY
 *   authenticated reader, admin or not. Driven against TEST on 20 September
 *   2026: the first build of this function used the session client and the edit
 *   screen went to its error boundary on all three viewports. The same
 *   recursion refuses an authenticated read of cities, communities, suburbs,
 *   event_types and audit_log; anonymous readers are unaffected, which is why
 *   the public site never showed it. It is recorded for the owning lane in
 *   C:\dev\REVIEW-QUEUE-B.md and is a database fix, not a fix here.
 *
 *   The caller is responsible for authorisation BEFORE calling this, which is
 *   the same contract /dashboard/events/[id]/orders has always had: it gates on
 *   resolveEventAccess and then reads with an admin client, because an
 *   organiser is not the buyer whose rows these are.
 */
export async function readEventRevenue(
  client: SupabaseClient,
  eventId: string,
  {
    fallbackCurrency = 'AUD',
    pageSize,
  }: { fallbackCurrency?: string; pageSize?: number } = {},
): Promise<EventRevenueSummary> {
  /*
   * ORDERED ON THE PRIMARY KEY, because ranged paging over an undefined order
   * is not paging: Postgres may hand the same row back in two windows and no
   * window at all to another. `id` is unique, so the total order is total.
   */
  const orders = await readEveryRow<EventRevenueOrderRow & { id: string }>(
    'the event revenue orders',
    (from, to) =>
      client
        .from('orders')
        .select('id, total_cents, platform_fee_cents, processing_fee_cents, status, currency')
        .eq('event_id', eventId)
        .in('status', PAID_ORDER_STATUSES as unknown as string[])
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: (EventRevenueOrderRow & { id: string })[] | null
        error: { message: string } | null
      }>,
    pageSize ? { pageSize } : {},
  )

  /*
   * CHUNKED, because an `in` list is bounded by BYTES rather than by how many
   * things are in it (src/lib/supabase/in-chunks.ts), and a single `.in()` of
   * more than a thousand order ids is capped by the row ceiling as well. A
   * truncated refund list moves the number the WRONG way: refunds are
   * SUBTRACTED, so losing one leaves net revenue too HIGH.
   */
  const refunds: EventRevenueRefundRow[] = []
  for (const chunk of chunkInFilterValues(orders.map(o => o.id))) {
    const rows = await readEveryRow<EventRevenueRefundRow>(
      'the event revenue refunds',
      (from, to) =>
        client
          .from('refunds')
          .select('amount_cents, status')
          .in('order_id', chunk)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: EventRevenueRefundRow[] | null
          error: { message: string } | null
        }>,
      pageSize ? { pageSize } : {},
    )
    refunds.push(...rows)
  }

  return summariseEventRevenue(orders, refunds, fallbackCurrency)
}
