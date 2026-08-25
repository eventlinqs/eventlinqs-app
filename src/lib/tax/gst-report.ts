import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gstOnInclusiveCents } from './tax-invoice'

/**
 * THE GST AN ORGANISER COLLECTED, PER QUARTER, FROM THE ORDERS THEMSELVES.
 *
 * ============================================================================
 * WHY IT COUNTS THE ROWS RATHER THAN READING A TOTAL
 * ============================================================================
 *
 * There is no stored `gst_collected_cents` column, and there deliberately is
 * not going to be one. The drift audit of 25 August 2026 drove nine stored
 * figures on this platform and six of them did not follow the rows they
 * summarised, including every lifetime counter on `organisations`. A number an
 * organiser copies onto a Business Activity Statement is the last figure on the
 * platform that should be a second copy of something.
 *
 * So this reads the confirmed orders, subtracts the refunds, and computes.
 *
 * ============================================================================
 * WHAT IS COUNTED, AND WHAT IS NOT
 * ============================================================================
 *
 * GST is one eleventh of a GST-inclusive amount, rounded to the nearest cent,
 * per the ATO rounding rule for a single taxable sale ("the amount of GST
 * should be rounded to the nearest cent (rounding 0.5 cents upwards)",
 * https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices,
 * page last updated 25 August 2025, fetched 25 August 2026).
 *
 * It is computed on the ORDER SUBTOTAL, not the total, and the difference
 * matters. Under the platform's collection-agent posture the organiser is the
 * seller of the TICKET; the EventLinqs fee is EventLinqs' own supply to the
 * organiser and is not part of what the organiser sold. Including the fee in
 * the organiser's GST would overstate what they owe on every pass-on order.
 *
 * REFUNDS REDUCE IT. A refunded ticket is a sale that did not happen, and its
 * GST is not owed. Refunds are read from the refunds table and netted off the
 * period they were RECONCILED in, not the period of the original sale, which is
 * how an adjustment is normally reported.
 *
 * IT REPORTS ZERO, HONESTLY, FOR AN UNREGISTERED ORGANISER. A business that is
 * not registered for GST collects none. The report says so in words rather than
 * showing a number they might act on.
 */

export interface GstPeriod {
  /** Australian financial-year quarter label, for example "Oct-Dec 2026". */
  label: string
  start: string
  end: string
  orderCount: number
  /** GST-inclusive ticket sales, in cents, net of nothing. */
  salesCents: number
  /** GST-inclusive refunds reconciled in this period, in cents. */
  refundsCents: number
  /** One eleventh of (sales - refunds), rounded per the ATO rule. */
  gstCents: number
}

export interface GstReport {
  organisationId: string
  organisationName: string
  gstRegistered: boolean
  abn: string | null
  /** Set when the organiser is not registered; the caller shows this instead of numbers. */
  notApplicableReason: string | null
  currency: string
  periods: GstPeriod[]
  totalSalesCents: number
  totalRefundsCents: number
  totalGstCents: number
  generatedAt: Date
}

/**
 * The Australian BAS quarters: Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun.
 *
 * Quarters rather than months because that is the cycle a BAS is lodged on for
 * the great majority of small businesses, and a report whose rows do not line
 * up with the form it feeds has to be added up by hand.
 */
const QUARTER_STARTS = [0, 3, 6, 9] as const
const QUARTER_LABELS = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'] as const

function quarterOf(date: Date): { key: string; label: string; start: Date; end: Date } {
  const month = date.getUTCMonth()
  const index = QUARTER_STARTS.findIndex((s, i) => month >= s && (i === 3 || month < QUARTER_STARTS[i + 1]))
  const startMonth = QUARTER_STARTS[index]
  const year = date.getUTCFullYear()
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 1))
  return { key: `${year}-${startMonth}`, label: `${QUARTER_LABELS[index]} ${year}`, start, end }
}

interface OrderRow {
  id: string
  subtotal_cents: number | null
  currency: string | null
  confirmed_at: string | null
  created_at: string
}

interface RefundRow {
  amount_cents: number | null
  processed_at: string | null
  created_at: string
}

export async function buildGstReport(organisationId: string, now: Date): Promise<GstReport | null> {
  const admin = createAdminClient()

  const { data: org, error: orgError } = await admin
    .from('organisations')
    .select('id, name, abn, gst_registered')
    .eq('id', organisationId)
    .maybeSingle()
  if (orgError) {
    console.error('[gst-report] organisation lookup failed:', orgError)
    return null
  }
  if (!org) return null

  const base: GstReport = {
    organisationId: org.id,
    organisationName: org.name,
    gstRegistered: org.gst_registered ?? false,
    abn: org.abn ?? null,
    notApplicableReason: null,
    currency: 'AUD',
    periods: [],
    totalSalesCents: 0,
    totalRefundsCents: 0,
    totalGstCents: 0,
    generatedAt: now,
  }

  if (!base.gstRegistered) {
    return {
      ...base,
      notApplicableReason:
        'This business is not recorded as registered for GST, so it collects none on its ticket sales.',
    }
  }

  const { data: orders, error: orderError } = await admin
    .from('orders')
    .select('id, subtotal_cents, currency, confirmed_at, created_at')
    .eq('organisation_id', organisationId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true })
    .limit(50000)
  if (orderError) {
    console.error('[gst-report] order read failed:', orderError)
    return null
  }

  const orderIds = (orders ?? []).map(o => o.id)
  let refunds: RefundRow[] = []
  if (orderIds.length > 0) {
    const { data, error } = await admin
      .from('refunds')
      .select('amount_cents, processed_at, created_at')
      .in('order_id', orderIds)
      // 'completed', not 'succeeded'. The refund_status enum is
      // pending/processing/completed/failed/cancelled (migration
      // 20260503000001), and Postgres rejects an unknown enum value outright
      // with 22P02 rather than matching nothing, so the wrong string took the
      // WHOLE REPORT down rather than silently returning zero refunds. Found by
      // the verification drive, which loaded the page.
      .eq('status', 'completed')
      .limit(50000)
    if (error) {
      // A report that quietly omits refunds OVERSTATES what the organiser owes,
      // which is the direction that costs them money. It refuses instead.
      console.error('[gst-report] refund read failed:', error)
      return null
    }
    refunds = (data ?? []) as RefundRow[]
  }

  const byQuarter = new Map<string, GstPeriod & { sortKey: number }>()
  const bucket = (when: Date) => {
    const q = quarterOf(when)
    const existing = byQuarter.get(q.key)
    if (existing) return existing
    const created = {
      label: q.label,
      start: q.start.toISOString(),
      end: q.end.toISOString(),
      orderCount: 0,
      salesCents: 0,
      refundsCents: 0,
      gstCents: 0,
      sortKey: q.start.getTime(),
    }
    byQuarter.set(q.key, created)
    return created
  }

  let currency = 'AUD'
  for (const o of (orders ?? []) as OrderRow[]) {
    const when = new Date(o.confirmed_at ?? o.created_at)
    const period = bucket(when)
    period.orderCount += 1
    period.salesCents += Number(o.subtotal_cents ?? 0)
    if (o.currency) currency = o.currency
  }
  for (const r of refunds) {
    const when = new Date(r.processed_at ?? r.created_at)
    bucket(when).refundsCents += Number(r.amount_cents ?? 0)
  }

  const periods = [...byQuarter.values()]
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...p }) => ({
      ...p,
      gstCents: gstOnInclusiveCents(Math.max(0, p.salesCents - p.refundsCents)),
    }))

  return {
    ...base,
    currency,
    periods,
    totalSalesCents: periods.reduce((s, p) => s + p.salesCents, 0),
    totalRefundsCents: periods.reduce((s, p) => s + p.refundsCents, 0),
    totalGstCents: periods.reduce((s, p) => s + p.gstCents, 0),
  }
}
