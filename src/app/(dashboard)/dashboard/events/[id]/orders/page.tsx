import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { OrderTable } from '@/components/orders/order-table'
import { RevenueSummary } from '@/components/orders/revenue-summary'
import type { Order } from '@/types/database'

type Props = {
  params: Promise<{ id: string }>
}

export default async function EventOrdersPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organisation_id, currency, ticket_tiers(id, name, total_capacity, sold_count)')
    .eq('id', eventId)
    .single()

  if (!event) notFound()

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) notFound()

  // Fetch all orders for this event
  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(id, item_type, quantity)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const ordersData = (orders ?? []) as (Order & { order_items: { id: string; item_type: string; quantity: number }[] })[]

  // Build display orders (join buyer name/email from profile or guest fields)
  const userIds = ordersData.filter(o => o.user_id).map(o => o.user_id!)
  let profileMap = new Map<string, { full_name: string | null; email: string }>()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  const displayOrders = ordersData.map(o => {
    const profile = o.user_id ? profileMap.get(o.user_id) : undefined
    const ticket_count = o.order_items
      .filter(i => i.item_type === 'ticket')
      .reduce((s, i) => s + i.quantity, 0)
    return {
      ...o,
      buyer_name: profile?.full_name ?? o.guest_name ?? '',
      buyer_email: profile?.email ?? o.guest_email ?? '',
      ticket_count,
    }
  })

  // Stats — include refunded orders in revenue totals so numbers match payouts
  const confirmedOrders = ordersData.filter(o =>
    ['confirmed', 'partially_refunded', 'refunded'].includes(o.status)
  )
  const totalRevenue = confirmedOrders.reduce((s, o) => s + o.total_cents, 0)
  const totalPlatformFees = confirmedOrders.reduce((s, o) => s + o.platform_fee_cents, 0)
  const totalProcessingFees = confirmedOrders.reduce((s, o) => s + o.processing_fee_cents, 0)
  const ticketsSold = confirmedOrders.reduce((s, o) => {
    return s + o.order_items.filter(i => i.item_type === 'ticket').reduce((ss, i) => ss + i.quantity, 0)
  }, 0)

  const totalCapacity = (event.ticket_tiers ?? []).reduce((s: number, t: { total_capacity: number }) => s + t.total_capacity, 0)
  const remaining = totalCapacity - ticketsSold

  const currency = event.currency ?? 'AUD'

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}/edit`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Event
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <span className="text-gray-400 text-sm">·</span>
        <span className="text-sm text-gray-600">{event.title}</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{confirmedOrders.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {currency.toUpperCase()} {(totalRevenue / 100).toFixed(0)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Tickets Sold</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{ticketsSold}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Remaining</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{remaining}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <OrderTable orders={displayOrders} eventId={eventId} />
        </div>
        <div>
          <RevenueSummary
            grossCents={totalRevenue}
            platformFeeCents={totalPlatformFees}
            processingFeeCents={totalProcessingFees}
            currency={currency}
          />

          <div className="mt-4 flex gap-2">
            <Link
              href={`/dashboard/events/${eventId}/discounts`}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Discount Codes
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
