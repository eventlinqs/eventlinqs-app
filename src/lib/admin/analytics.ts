import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'

/**
 * Admin GMV / financial analytics. Read-only aggregation over existing tables
 * (orders, refunds) - no new schema, no invented columns. v1 is AUD.
 *
 * GMV counts orders where a sale actually occurred: confirmed,
 * partially_refunded, or refunded (the order was paid; refunds are netted
 * separately). pending/cancelled/expired never counted.
 *
 * At launch scale this aggregates in the app over fetched rows; a materialised
 * rollup is the optimisation when order volume grows large.
 */

export const ANALYTICS_CURRENCY = 'AUD'
const GMV_STATUSES = new Set(['confirmed', 'partially_refunded', 'refunded'])

export interface GmvOrderRow {
  total_cents: number
  platform_fee_cents: number
  status: string
}

export interface GmvSummary {
  grossGmvCents: number
  platformRevenueCents: number
  refundedCents: number
  netGmvCents: number
  paidOrders: number
}

/** Pure aggregator: orders + completed refunds -> the GMV summary. */
export function aggregateGmv(
  orders: GmvOrderRow[],
  refunds: { amount_cents: number; status: string }[],
): GmvSummary {
  let grossGmvCents = 0
  let platformRevenueCents = 0
  let paidOrders = 0
  for (const o of orders) {
    if (!GMV_STATUSES.has(o.status)) continue
    grossGmvCents += Number(o.total_cents ?? 0)
    platformRevenueCents += Number(o.platform_fee_cents ?? 0)
    paidOrders += 1
  }
  const refundedCents = refunds
    .filter(r => r.status === 'completed')
    .reduce((s, r) => s + Number(r.amount_cents ?? 0), 0)
  return {
    grossGmvCents,
    platformRevenueCents,
    refundedCents,
    netGmvCents: grossGmvCents - refundedCents,
    paidOrders,
  }
}

export interface GmvMonthPoint {
  month: string // YYYY-MM
  gmvCents: number
}

export interface TopOrganiser {
  organisationId: string
  name: string
  gmvCents: number
}

export interface AnalyticsDashboard {
  summary: GmvSummary
  byMonth: GmvMonthPoint[]
  topOrganisers: TopOrganiser[]
  currency: string
}

interface DashOrderRow extends GmvOrderRow {
  created_at: string
  organisation_id: string
}

export async function getAnalyticsDashboard(): Promise<AnalyticsDashboard> {
  const db = createAdminClient()

  /*
   * EVERY ORDER, NOT THE FIRST THOUSAND, AND NOT AN ARBITRARY THOUSAND.
   *
   * Both of these were unbounded selects whose results are then summed in the
   * loops below. Supabase caps one response at a fixed number of rows, 1,000 by
   * default (https://supabase.com/docs/reference/javascript/select, fetched
   * 2026-09-19), and the cap is invisible: HTTP 200, `error` null, a
   * full-looking array. Measured against this project on 20 September 2026:
   *
   *     Content-Range: 0-999/14364      an unbounded select on a 14,364 row table
   *
   * The header above says this aggregates in the app "over fetched rows". What
   * it did not say is that the number of fetched rows stops rising at the
   * ceiling while the platform keeps selling. TEST held 801 AUD orders when this
   * was written, so the screen was 199 orders away from reporting a GMV that
   * simply stops growing, on the one screen the founder reads to find out how
   * the business is doing.
   *
   * THERE WAS NO `order by` EITHER, WHICH IS WORSE THAN THE CAP. Postgres is
   * free to return any 1,000 of the matching rows, so past the ceiling the
   * figure would not have been "GMV so far" or "GMV of the oldest thousand". It
   * would have been the total of an arbitrary subset, changing between page
   * loads, with nothing on the screen to say so.
   *
   * AND THE ERROR WAS DISCARDED. `const { data } = await ...` dropped `error`,
   * so a read that failed rendered `?? []`, and the dashboard showed a GMV of
   * $0. Zero revenue is a number a founder would act on, and it is
   * indistinguishable on that screen from a payments outage. `readEveryRow`
   * throws on a failed page, so the screen now fails rather than lies.
   *
   * WHAT THIS DOES NOT FIX, stated rather than implied: the aggregation still
   * happens in the app, so this now reads every order into memory on every load.
   * That is the tradeoff the module header already names, and it is the right
   * way round: `readEveryRow` refuses past 200,000 rows, so the failure mode at
   * real scale is a loud one rather than a quiet wrong number. The materialised
   * rollup the header calls for is the fix for the cost, and it is a separate
   * piece of work with a migration in it.
   */
  const orders = await readEveryRow<DashOrderRow>('the admin GMV orders', (from, to) =>
    db
      .from('orders')
      .select('total_cents, platform_fee_cents, status, created_at, organisation_id')
      .eq('currency', ANALYTICS_CURRENCY)
      .order('id', { ascending: true })
      .range(from, to),
  )

  const refunds = await readEveryRow<{ amount_cents: number; status: string }>(
    'the admin GMV refunds',
    (from, to) =>
      db
        .from('refunds')
        .select('amount_cents, status')
        .eq('currency', ANALYTICS_CURRENCY)
        .order('id', { ascending: true })
        .range(from, to),
  )

  const summary = aggregateGmv(orders, refunds)

  // GMV by month (last 6 months, ascending).
  const monthMap = new Map<string, number>()
  for (const o of orders) {
    if (!GMV_STATUSES.has(o.status)) continue
    const month = (o.created_at ?? '').slice(0, 7)
    if (!month) continue
    monthMap.set(month, (monthMap.get(month) ?? 0) + Number(o.total_cents ?? 0))
  }
  const byMonth: GmvMonthPoint[] = [...monthMap.entries()]
    .map(([month, gmvCents]) => ({ month, gmvCents }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)

  // Top organisers by GMV.
  const orgMap = new Map<string, number>()
  for (const o of orders) {
    if (!GMV_STATUSES.has(o.status)) continue
    orgMap.set(o.organisation_id, (orgMap.get(o.organisation_id) ?? 0) + Number(o.total_cents ?? 0))
  }
  const topIds = [...orgMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const nameById = new Map<string, string>()
  if (topIds.length > 0) {
    /*
     * BOUNDED BY ITS OWN `in` LIST, and the `.limit()` says so out loud. There
     * are at most five ids here, so this could never have hit the ceiling; the
     * bound is written down anyway so a reader, and the guard, can see that it
     * is bounded rather than having to work it out from the line above.
     */
    const { data: orgs, error: orgError } = await db
      .from('organisations')
      .select('id, name')
      .in('id', topIds.map(([id]) => id))
      .limit(topIds.length)
    if (orgError) {
      throw new Error(`the admin GMV organiser names could not be read: ${orgError.message}`)
    }
    for (const o of orgs ?? []) nameById.set(o.id as string, o.name as string)
  }
  const topOrganisers: TopOrganiser[] = topIds.map(([organisationId, gmvCents]) => ({
    organisationId,
    name: nameById.get(organisationId) ?? 'Unknown organiser',
    gmvCents,
  }))

  return { summary, byMonth, topOrganisers, currency: ANALYTICS_CURRENCY }
}
