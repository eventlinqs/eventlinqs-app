import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConfirmationActions } from '@/components/orders/confirmation-actions'
import type { Order, OrderItem } from '@/types/database'

type Props = {
  params: Promise<{ order_id: string }>
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>
}

type FullOrder = Order & { order_items: OrderItem[] }

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export default async function OrderConfirmationPage({ params, searchParams }: Props) {
  const { order_id } = await params
  const { redirect_status } = await searchParams

  const supabase = await createClient()
  // Admin client — order may belong to a guest (user_id null) or a different user (organiser view),
  // so session-based RLS would block the SELECT. Authorization is by order_id/order_number (unguessable).
  const adminClient = createAdminClient()

  // Fetch order — can be by UUID or by order_number (EL-XXXXXXXX)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id)

  const query = adminClient
    .from('orders')
    .select('*, order_items(*)')

  const { data: order } = isUUID
    ? await query.eq('id', order_id).single()
    : await query.eq('order_number', order_id).single()

  if (!order) notFound()

  const fullOrder = order as FullOrder

  // If Stripe just redirected back with succeeded status, the webhook may still be processing
  // Show confirmation page anyway — the webhook will confirm the order
  const isConfirmed = fullOrder.status === 'confirmed' || redirect_status === 'succeeded'

  const { data: event } = await adminClient
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country, slug')
    .eq('id', fullOrder.event_id)
    .single()

  if (!event) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isGuest = !user

  // Determine smart logo link: organisers go to their dashboard, everyone else browses events
  let logoHref = '/events'
  if (user) {
    const { data: org } = await adminClient
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (org) logoHref = '/dashboard/events'
  }

  const eventDate = new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })

  const location = [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')

  const ticketItems = fullOrder.order_items.filter(i => i.item_type === 'ticket')
  const addonItems = fullOrder.order_items.filter(i => i.item_type === 'addon')

  // Group tickets by tier name
  const tierGroups = new Map<string, number>()
  for (const item of ticketItems) {
    tierGroups.set(item.item_name, (tierGroups.get(item.item_name) ?? 0) + item.quantity)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Link href={logoHref} className="text-xl font-bold text-[#1A1A2E]">EVENTLINQS</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isConfirmed ? 'Order Confirmed' : 'Order Received'}
          </h1>
          <p className="mt-1 text-gray-500">Order <span className="font-mono font-semibold text-gray-800">{fullOrder.order_number}</span></p>
        </div>

        {/* Event details */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{event.title}</h2>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <svg className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{eventDate}</span>
            </div>
            {location && (
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tickets */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Tickets Purchased</h3>
          <div className="space-y-2">
            {Array.from(tierGroups).map(([name, qty]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-gray-700">{name}</span>
                <span className="text-gray-500">×{qty}</span>
              </div>
            ))}
            {addonItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500">{item.item_name} (add-on)</span>
                <span className="text-gray-400">×{item.quantity}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
            <span className="text-sm font-semibold text-gray-900">Total paid</span>
            <span className="text-sm font-bold text-gray-900">{formatCents(fullOrder.total_cents, fullOrder.currency)}</span>
          </div>
        </div>

        {/* Ticket availability message */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6 text-sm text-blue-800">
          <p className="font-medium">Your tickets will be available in your account</p>
          <p className="mt-1 text-blue-600">Digital tickets and QR codes will be sent to your email once activated.</p>
        </div>

        {/* Actions */}
        <ConfirmationActions
          eventTitle={event.title}
          startDate={event.start_date}
          endDate={event.end_date}
          location={location}
          orderNumber={fullOrder.order_number}
          eventSlug={event.slug}
        />

        {/* Guest CTA */}
        {isGuest && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center mb-6">
            <p className="text-sm font-semibold text-gray-900">Create an account to manage your tickets</p>
            <p className="mt-1 text-xs text-gray-500">Access order history, digital tickets, and more</p>
            <Link
              href="/signup"
              className="mt-3 inline-block rounded-lg bg-[#1A1A2E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2d2d4a]"
            >
              Create Account
            </Link>
          </div>
        )}

        <div className="text-center">
          <Link href="/events" className="text-sm text-[#4A90D9] hover:underline">
            Browse More Events →
          </Link>
        </div>
      </div>
    </div>
  )
}
