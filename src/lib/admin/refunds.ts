import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin refunds queue data access. Read-only helpers over the service-role
 * client; the actual refund mutation flows through the existing refund service
 * (requestTicketRefund) from the order detail page. This module powers the
 * platform-wide "Pending refunds" tile + the /admin/refunds queue, so an
 * operator can see every refund that still needs attention in one place rather
 * than only per-order.
 *
 * "Open" = a refund that is not in a terminal state: pending (created, not yet
 * sent to Stripe), processing (in flight), or failed (needs an operator retry).
 * completed and cancelled are terminal and only appear under the All / status
 * filters.
 */

export const OPEN_REFUND_STATUSES = ['pending', 'processing', 'failed'] as const

export const REFUND_STATUS_FILTERS = ['open', 'all', 'pending', 'processing', 'failed', 'completed', 'cancelled'] as const
export type RefundStatusFilter = (typeof REFUND_STATUS_FILTERS)[number]

export interface AdminRefundRow {
  id: string
  amountCents: number
  currency: string
  status: string
  reason: string
  requestedAt: string
  failureReason: string | null
  orderId: string
  orderNumber: string | null
  organisationName: string | null
  eventTitle: string | null
}

const PAGE_SIZE = 25
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

export async function countPendingRefunds(): Promise<number> {
  const db = createAdminClient()
  const { count, error } = await db
    .from('refunds')
    .select('id', { count: 'exact', head: true })
    .in('status', OPEN_REFUND_STATUSES as unknown as string[])
  if (error) throw new Error(`countPendingRefunds: ${error.message}`)
  return count ?? 0
}

export async function listRefundsForAdmin(opts: { search?: string; status?: string; page?: number }): Promise<{
  rows: AdminRefundRow[]
  page: number
  hasMore: boolean
  statusFilter: RefundStatusFilter
}> {
  const db = createAdminClient()
  const page = Math.max(opts.page ?? 1, 1)
  const from = (page - 1) * PAGE_SIZE

  const requested = (opts.status?.trim() ?? 'open') as RefundStatusFilter
  const statusFilter: RefundStatusFilter = REFUND_STATUS_FILTERS.includes(requested) ? requested : 'open'

  let query = db
    .from('refunds')
    .select(
      'id, amount_cents, currency, status, reason, requested_at, failure_reason, order_id, organisations(name), orders(order_number, events(title))',
    )
    .order('requested_at', { ascending: false })
    .range(from, from + PAGE_SIZE)

  if (statusFilter === 'open') {
    query = query.in('status', OPEN_REFUND_STATUSES as unknown as string[])
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const search = opts.search?.trim()
  if (search) {
    // Resolve order ids whose order_number matches, then constrain the queue to
    // them. order_number is the operator's primary lookup key; this keeps the
    // filter on the top-level rows (not the embedded resource).
    const { data: matchOrders } = await db
      .from('orders')
      .select('id')
      .ilike('order_number', `%${search}%`)
      .limit(200)
    const ids = (matchOrders ?? []).map(o => (o as { id: string }).id)
    query = query.in('order_id', ids.length ? ids : [NO_MATCH])
  }

  const { data, error } = await query
  if (error) throw new Error(`listRefundsForAdmin: ${error.message}`)

  const all = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = all.length > PAGE_SIZE
  const rows: AdminRefundRow[] = all.slice(0, PAGE_SIZE).map(r => {
    const order = r.orders as { order_number?: string; events?: { title?: string } | null } | null
    const org = r.organisations as { name?: string } | null
    return {
      id: r.id as string,
      amountCents: r.amount_cents as number,
      currency: r.currency as string,
      status: r.status as string,
      reason: r.reason as string,
      requestedAt: r.requested_at as string,
      failureReason: (r.failure_reason as string | null) ?? null,
      orderId: r.order_id as string,
      orderNumber: order?.order_number ?? null,
      organisationName: org?.name ?? null,
      eventTitle: order?.events?.title ?? null,
    }
  })

  return { rows, page, hasMore, statusFilter }
}
