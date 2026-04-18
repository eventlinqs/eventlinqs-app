import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type OrderRow = {
  id: string
  order_number: string
  status: string
  total_cents: number
  currency: string
  created_at: string
  confirmed_at: string | null
  event_id: string
  order_items: {
    id: string
    item_type: string
    item_name: string
    quantity: number
    attendee_first_name: string | null
    attendee_last_name: string | null
  }[]
}

type EventInfo = {
  id: string
  title: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  slug: string
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  partially_refunded: 'bg-amber-100 text-amber-700',
  refunded: 'bg-ink-100 text-ink-600',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCents(cents: number, currency: string) {
  if (cents === 0) return 'Free'
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export default async function MyTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  // Fetch all confirmed/refunded orders for this user — admin client bypasses RLS
  const { data: orders } = await adminClient
    .from('orders')
    .select('id, order_number, status, total_cents, currency, created_at, confirmed_at, event_id, order_items(id, item_type, item_name, quantity, attendee_first_name, attendee_last_name)')
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'partially_refunded', 'refunded'])
    .order('created_at', { ascending: false })

  const orderRows = (orders ?? []) as OrderRow[]

  // Fetch event details for each order
  const eventIds = [...new Set(orderRows.map(o => o.event_id))]
  const eventMap = new Map<string, EventInfo>()

  if (eventIds.length > 0) {
    const { data: events } = await adminClient
      .from('events')
      .select('id, title, start_date, venue_name, venue_city, slug')
      .in('id', eventIds)
    for (const e of events ?? []) {
      eventMap.set(e.id, e as EventInfo)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">My Tickets</h1>

      {orderRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z" />
            </svg>
          </div>
          <h2 className="mt-5 font-display text-lg font-semibold text-ink-900">You have not bought any tickets yet</h2>
          <p className="mt-1 max-w-md text-sm text-ink-600">
            Tickets you buy will appear here with QR codes and order details.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orderRows.map(order => {
            const event = eventMap.get(order.event_id)
            const ticketItems = order.order_items.filter(i => i.item_type === 'ticket')
            const badgeClass = STATUS_BADGE[order.status] ?? 'bg-ink-100 text-ink-600'

            return (
              <div key={order.id} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badgeClass}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-ink-400 font-mono">{order.order_number}</span>
                    </div>
                    {event ? (
                      <Link
                        href={`/events/${event.slug}`}
                        className="text-base font-semibold text-ink-900 hover:text-gold-500 transition-colors"
                      >
                        {event.title}
                      </Link>
                    ) : (
                      <p className="text-base font-semibold text-ink-900">Event</p>
                    )}
                    {event && (
                      <p className="mt-0.5 text-sm text-ink-400">
                        {formatDate(event.start_date)}
                        {event.venue_city ? ` · ${event.venue_city}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-ink-900">
                      {formatCents(order.total_cents, order.currency)}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">{formatDate(order.created_at)}</p>
                  </div>
                </div>

                {ticketItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-ink-100">
                    <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-2">Tickets</p>
                    <div className="space-y-1">
                      {ticketItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink-600">{item.item_name}</span>
                          {(item.attendee_first_name || item.attendee_last_name) && (
                            <span className="text-xs text-ink-400">
                              {[item.attendee_first_name, item.attendee_last_name].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/orders/${order.order_number}/confirmation`}
                    className="text-xs text-gold-500 hover:text-gold-600"
                  >
                    View Order →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
