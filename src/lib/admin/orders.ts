import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin order/attendee data access for the refund operator path. Read-only
 * helpers over the service-role client; all refund writes flow through the
 * create_refund_request RPC via the refund service.
 */

export interface AdminOrderListRow {
  id: string
  order_number: string
  status: string
  total_cents: number
  currency: string
  buyer_email: string | null
  created_at: string
  event_title: string | null
}

export interface AdminOrderTicket {
  id: string
  code: string
  holderName: string | null
  status: string
  faceCents: number
}

export interface AdminOrderRefund {
  id: string
  amount_cents: number
  currency: string
  status: string
  reason: string
  created_at: string
}

export interface AdminOrderDetail {
  id: string
  order_number: string
  status: string
  total_cents: number
  currency: string
  buyer_email: string | null
  buyer_name: string | null
  created_at: string
  event_title: string | null
  tickets: AdminOrderTicket[]
  allFaceCents: number
  refunds: AdminOrderRefund[]
}

const PAGE_SIZE = 25

export async function listOrdersForAdmin(opts: { search?: string; page?: number }): Promise<{
  rows: AdminOrderListRow[]
  page: number
  hasMore: boolean
}> {
  const db = createAdminClient()
  const page = Math.max(opts.page ?? 1, 1)
  const from = (page - 1) * PAGE_SIZE

  let query = db
    .from('orders')
    .select('id, order_number, status, total_cents, currency, guest_email, created_at, events(title)')
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE)

  const search = opts.search?.trim()
  if (search) {
    // Match order number or buyer email.
    query = query.or(`order_number.ilike.%${search}%,guest_email.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`listOrdersForAdmin: ${error.message}`)

  const all = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = all.length > PAGE_SIZE
  const rows: AdminOrderListRow[] = all.slice(0, PAGE_SIZE).map(o => ({
    id: o.id as string,
    order_number: o.order_number as string,
    status: o.status as string,
    total_cents: o.total_cents as number,
    currency: o.currency as string,
    buyer_email: (o.guest_email as string | null) ?? null,
    created_at: o.created_at as string,
    event_title: ((o.events as { title?: string } | null)?.title) ?? null,
  }))

  return { rows, page, hasMore }
}

export async function getOrderForAdmin(orderId: string): Promise<AdminOrderDetail | null> {
  const db = createAdminClient()

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, status, total_cents, currency, guest_email, guest_name, created_at, event_id, events(title)')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return null

  const { data: items } = await db
    .from('order_items')
    .select('id, unit_price_cents')
    .eq('order_id', orderId)
  const priceByItem = new Map<string, number>()
  for (const it of items ?? []) priceByItem.set(it.id as string, (it.unit_price_cents as number) ?? 0)

  const { data: ticketRows } = await db
    .from('tickets')
    .select('id, ticket_code, holder_name, status, order_item_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  const tickets: AdminOrderTicket[] = (ticketRows ?? []).map(t => ({
    id: t.id as string,
    code: t.ticket_code as string,
    holderName: (t.holder_name as string | null) ?? null,
    status: t.status as string,
    faceCents: priceByItem.get(t.order_item_id as string) ?? 0,
  }))
  const allFaceCents = tickets.reduce((sum, t) => sum + t.faceCents, 0)

  const { data: refundRows } = await db
    .from('refunds')
    .select('id, amount_cents, currency, status, reason, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  const refunds: AdminOrderRefund[] = (refundRows ?? []).map(r => ({
    id: r.id as string,
    amount_cents: r.amount_cents as number,
    currency: r.currency as string,
    status: r.status as string,
    reason: r.reason as string,
    created_at: r.created_at as string,
  }))

  return {
    id: order.id as string,
    order_number: order.order_number as string,
    status: order.status as string,
    total_cents: order.total_cents as number,
    currency: order.currency as string,
    buyer_email: (order.guest_email as string | null) ?? null,
    buyer_name: (order.guest_name as string | null) ?? null,
    created_at: order.created_at as string,
    event_title: ((order.events as { title?: string } | null)?.title) ?? null,
    tickets,
    allFaceCents,
    refunds,
  }
}
