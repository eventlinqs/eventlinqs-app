import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data: orderRows } = await db
    .from('orders')
    .select('total_cents, platform_fee_cents, status, created_at, organisation_id')
    .eq('currency', ANALYTICS_CURRENCY)
  const orders = (orderRows ?? []) as DashOrderRow[]

  const { data: refundRows } = await db
    .from('refunds')
    .select('amount_cents, status')
    .eq('currency', ANALYTICS_CURRENCY)
  const refunds = (refundRows ?? []) as { amount_cents: number; status: string }[]

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
    const { data: orgs } = await db
      .from('organisations')
      .select('id, name')
      .in('id', topIds.map(([id]) => id))
    for (const o of orgs ?? []) nameById.set(o.id as string, o.name as string)
  }
  const topOrganisers: TopOrganiser[] = topIds.map(([organisationId, gmvCents]) => ({
    organisationId,
    name: nameById.get(organisationId) ?? 'Unknown organiser',
    gmvCents,
  }))

  return { summary, byMonth, topOrganisers, currency: ANALYTICS_CURRENCY }
}
