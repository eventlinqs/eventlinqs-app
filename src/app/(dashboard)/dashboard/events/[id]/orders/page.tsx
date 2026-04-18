import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrderTable } from '@/components/orders/order-table'
import { RevenueSummary } from '@/components/orders/revenue-summary'
import type { Order } from '@/types/database'

type Props = {
  params: Promise<{ id: string }>
}

export default async function EventOrdersPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organisation_id, waitlist_enabled, ticket_tiers(id, name, total_capacity, sold_count)')
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

  // Fetch all orders for this event — admin client bypasses RLS (organiser is not the buyer)
  const { data: orders } = await adminClient
    .from('orders')
    .select('*, order_items(id, item_type, quantity)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const ordersData = (orders ?? []) as (Order & { order_items: { id: string; item_type: string; quantity: number }[] })[]

  // Build display orders (join buyer name/email from profile or guest fields)
  const userIds = ordersData.filter(o => o.user_id).map(o => o.user_id!)
  let profileMap = new Map<string, { full_name: string | null; email: string }>()

  if (userIds.length > 0) {
    // Admin client needed — organiser reading other users' profiles
    const { data: profiles } = await adminClient
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

  const currency = ordersData[0]?.currency ?? 'AUD'

  // Fetch waitlist counts per tier (admin client — organiser reading buyer waitlist data)
  let waitlistCountByTier: { tier_id: string; tier_name: string; waiting: number }[] = []
  if (event.waitlist_enabled) {
    const tiers = (event.ticket_tiers ?? []) as { id: string; name: string; total_capacity: number; sold_count: number }[]
    const waitlistCounts = await Promise.all(
      tiers.map(async (t) => {
        const { count } = await adminClient
          .from('waitlist')
          .select('id', { count: 'exact', head: true })
          .eq('ticket_tier_id', t.id)
          .eq('status', 'waiting')
        return { tier_id: t.id, tier_name: t.name, waiting: count ?? 0 }
      })
    )
    waitlistCountByTier = waitlistCounts.filter(w => w.waiting > 0)
  }
  const totalWaiting = waitlistCountByTier.reduce((s, w) => s + w.waiting, 0)

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
      <div className={`grid grid-cols-2 gap-4 mb-6 ${event.waitlist_enabled ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{confirmedOrders.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
            {new Intl.NumberFormat('en-AU', {
              style: 'currency',
              currency: currency.toUpperCase(),
              currencyDisplay: 'code',
            }).format(totalRevenue / 100)}
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
        {event.waitlist_enabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs text-amber-700 uppercase tracking-wider">Waitlist</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">{totalWaiting}</p>
            {waitlistCountByTier.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {waitlistCountByTier.map(w => (
                  <p key={w.tier_id} className="text-xs text-amber-700">
                    {w.tier_name}: {w.waiting}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
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
