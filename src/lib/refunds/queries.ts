import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Refund, RefundStatus } from '@/types/database'

/**
 * M6 Phase 5 - Refunds queries.
 *
 * All read functions accept an optional injectable Supabase client for tests
 * and default to the admin client (RLS-bypassing) for server-side use. The
 * mutations layer enforces ownership checks before delegating here.
 */

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20

export interface RefundsPage {
  rows: RefundRow[]
  total: number
  limit: number
  offset: number
}

export interface RefundRow extends Refund {
  order_number?: string | null
  buyer_email?: string | null
  buyer_name?: string | null
  event_title?: string | null
}

export interface RefundDetail extends RefundRow {
  order_total_cents?: number | null
  order_status?: string | null
}

export interface RefundStatistics {
  total_refunded_cents: number
  pending_count: number
  processing_count: number
  completed_count: number
  failed_count: number
  cancelled_count: number
  refund_rate_percent: number
  currency: string
}

export interface OrganiserRefundFilters {
  status?: RefundStatus | 'all'
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

export interface BuyerRefundFilters {
  limit?: number
  offset?: number
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(limit, MAX_PAGE_SIZE)
}

function clampOffset(offset?: number): number {
  if (!offset || offset < 0) return 0
  return offset
}

interface RawRefundRow extends Refund {
  orders?:
    | {
        order_number?: string | null
        guest_email?: string | null
        guest_name?: string | null
        total_cents?: number | null
        status?: string | null
        events?: { title?: string | null } | { title?: string | null }[] | null
        profiles?: { email?: string | null; full_name?: string | null } | null
      }
    | Array<{
        order_number?: string | null
        guest_email?: string | null
        guest_name?: string | null
        total_cents?: number | null
        status?: string | null
        events?: { title?: string | null } | { title?: string | null }[] | null
        profiles?: { email?: string | null; full_name?: string | null } | null
      }>
    | null
}

function flattenOrder(raw: RawRefundRow): {
  order_number: string | null
  buyer_email: string | null
  buyer_name: string | null
  event_title: string | null
  order_total_cents: number | null
  order_status: string | null
} {
  const order = Array.isArray(raw.orders) ? raw.orders[0] : raw.orders
  if (!order) {
    return {
      order_number: null,
      buyer_email: null,
      buyer_name: null,
      event_title: null,
      order_total_cents: null,
      order_status: null,
    }
  }
  const events = Array.isArray(order.events) ? order.events[0] : order.events
  return {
    order_number: order.order_number ?? null,
    buyer_email: order.profiles?.email ?? order.guest_email ?? null,
    buyer_name: order.profiles?.full_name ?? order.guest_name ?? null,
    event_title: events?.title ?? null,
    order_total_cents: order.total_cents ?? null,
    order_status: order.status ?? null,
  }
}

function shapeRow(raw: RawRefundRow): RefundRow {
  const flat = flattenOrder(raw)
  // Strip the relational payload before returning
  const { orders: _orders, ...rest } = raw
  return {
    ...(rest as Refund),
    order_number: flat.order_number,
    buyer_email: flat.buyer_email,
    buyer_name: flat.buyer_name,
    event_title: flat.event_title,
  }
}

function shapeDetail(raw: RawRefundRow): RefundDetail {
  const flat = flattenOrder(raw)
  const { orders: _orders, ...rest } = raw
  return {
    ...(rest as Refund),
    order_number: flat.order_number,
    buyer_email: flat.buyer_email,
    buyer_name: flat.buyer_name,
    event_title: flat.event_title,
    order_total_cents: flat.order_total_cents,
    order_status: flat.order_status,
  }
}

const REFUND_SELECT = `
  id, order_id, organisation_id, amount_cents, currency, reason, status, initiator,
  stripe_refund_id, stripe_application_fee_refund_id, refund_reverse_transfer,
  buyer_message, organiser_internal_notes, failure_reason,
  requested_by, processed_by, requested_at, processed_at, cancelled_at,
  created_at, updated_at,
  orders (
    order_number, guest_email, guest_name, total_cents, status,
    events ( title ),
    profiles:user_id ( email, full_name )
  )
`

export async function getOrganiserRefunds(
  organisationId: string,
  filters: OrganiserRefundFilters = {},
  client?: SupabaseClient
): Promise<RefundsPage> {
  const supabase = client ?? createAdminClient()
  const limit = clampLimit(filters.limit)
  const offset = clampOffset(filters.offset)

  let query = supabase
    .from('refunds')
    .select(REFUND_SELECT, { count: 'exact' })
    .eq('organisation_id', organisationId)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.fromDate) query = query.gte('created_at', filters.fromDate)
  if (filters.toDate) query = query.lte('created_at', filters.toDate)

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  const rows = ((data ?? []) as unknown as RawRefundRow[]).map(shapeRow)
  return { rows, total: count ?? rows.length, limit, offset }
}

export async function getBuyerRefundRequests(
  userId: string,
  filters: BuyerRefundFilters = {},
  client?: SupabaseClient
): Promise<RefundsPage> {
  const supabase = client ?? createAdminClient()
  const limit = clampLimit(filters.limit)
  const offset = clampOffset(filters.offset)

  const { data, error, count } = await supabase
    .from('refunds')
    .select(REFUND_SELECT, { count: 'exact' })
    .eq('requested_by', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  const rows = ((data ?? []) as unknown as RawRefundRow[]).map(shapeRow)
  return { rows, total: count ?? rows.length, limit, offset }
}

export async function getRefundById(
  refundId: string,
  client?: SupabaseClient
): Promise<RefundDetail | null> {
  const supabase = client ?? createAdminClient()
  const { data, error } = await supabase
    .from('refunds')
    .select(REFUND_SELECT)
    .eq('id', refundId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return shapeDetail(data as unknown as RawRefundRow)
}

interface CountedStatusRow {
  status: RefundStatus
}

interface AmountRow {
  amount_cents: number | string
  currency: string
}

interface OrdersTotalRow {
  total_cents: number | string
}

export async function getRefundStatistics(
  organisationId: string,
  client?: SupabaseClient
): Promise<RefundStatistics> {
  const supabase = client ?? createAdminClient()

  const [statusRowsRes, amountsRes, ordersRes] = await Promise.all([
    supabase.from('refunds').select('status').eq('organisation_id', organisationId),
    supabase
      .from('refunds')
      .select('amount_cents, currency')
      .eq('organisation_id', organisationId)
      .eq('status', 'completed'),
    supabase
      .from('orders')
      .select('total_cents')
      .eq('organisation_id', organisationId)
      .in('status', ['confirmed', 'partially_refunded', 'refunded']),
  ])

  if (statusRowsRes.error) throw statusRowsRes.error
  if (amountsRes.error) throw amountsRes.error
  if (ordersRes.error) throw ordersRes.error

  const statusRows = (statusRowsRes.data ?? []) as CountedStatusRow[]
  const amountRows = (amountsRes.data ?? []) as AmountRow[]
  const orderRows = (ordersRes.data ?? []) as OrdersTotalRow[]

  const counts = {
    pending_count: 0,
    processing_count: 0,
    completed_count: 0,
    failed_count: 0,
    cancelled_count: 0,
  }
  for (const row of statusRows) {
    if (row.status === 'pending') counts.pending_count += 1
    else if (row.status === 'processing') counts.processing_count += 1
    else if (row.status === 'completed') counts.completed_count += 1
    else if (row.status === 'failed') counts.failed_count += 1
    else if (row.status === 'cancelled') counts.cancelled_count += 1
  }

  const totalRefunded = amountRows.reduce(
    (sum, row) => sum + Number(row.amount_cents ?? 0),
    0
  )
  const currency = amountRows[0]?.currency ?? 'aud'

  const grossSales = orderRows.reduce(
    (sum, row) => sum + Number(row.total_cents ?? 0),
    0
  )
  const refundRate = grossSales > 0 ? (totalRefunded / grossSales) * 100 : 0

  return {
    total_refunded_cents: totalRefunded,
    ...counts,
    refund_rate_percent: Math.round(refundRate * 100) / 100,
    currency,
  }
}
