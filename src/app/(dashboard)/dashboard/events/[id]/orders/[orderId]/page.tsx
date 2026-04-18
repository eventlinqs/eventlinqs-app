import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Order, OrderItem, Payment } from '@/types/database'

type Props = {
  params: Promise<{ id: string; orderId: string }>
}

type FullOrder = Order & {
  order_items: OrderItem[]
  payments: Payment[]
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  refunded: { label: 'Refunded', className: 'bg-ink-100 text-ink-600' },
  expired: { label: 'Expired', className: 'bg-ink-100 text-ink-400' },
}

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export default async function OrderDetailPage({ params }: Props) {
  const { id: eventId, orderId } = await params

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organisation_id')
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

  // Admin client — organiser is not the buyer, RLS blocks session-client reads on orders/payments
  const { data: order } = await adminClient
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('id', orderId)
    .eq('event_id', eventId)
    .single()

  if (!order) notFound()

  const fullOrder = order as FullOrder

  // Load buyer profile if user order — admin client needed to read another user's profile
  let buyerName = fullOrder.guest_name ?? ''
  let buyerEmail = fullOrder.guest_email ?? ''

  if (fullOrder.user_id) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', fullOrder.user_id)
      .single()
    if (profile) {
      buyerName = profile.full_name ?? ''
      buyerEmail = profile.email ?? ''
    }
  }

  const payment = fullOrder.payments?.[0]
  const statusInfo = STATUS_LABELS[fullOrder.status] ?? { label: fullOrder.status, className: 'bg-ink-100 text-ink-600' }

  const ticketItems = fullOrder.order_items.filter(i => i.item_type === 'ticket')
  const addonItems = fullOrder.order_items.filter(i => i.item_type === 'addon')

  const organiserRevenue = fullOrder.total_cents - fullOrder.platform_fee_cents - fullOrder.processing_fee_cents

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/dashboard/events/${eventId}/orders`} className="text-sm text-ink-400 hover:text-ink-600">
          ← Orders
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Order {fullOrder.order_number}</h1>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Buyer */}
          <div className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-base font-semibold text-ink-900 mb-4">Buyer</h2>
            <div className="text-sm text-ink-600 space-y-1">
              <p><span className="text-ink-400">Name:</span> {buyerName || '—'}</p>
              <p><span className="text-ink-400">Email:</span> {buyerEmail}</p>
              {!fullOrder.user_id && (
                <p className="text-xs text-ink-400 mt-2">Guest checkout</p>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-base font-semibold text-ink-900 mb-4">Order Items</h2>
            <div className="divide-y divide-ink-100">
              {ticketItems.map(item => (
                <div key={item.id} className="py-3">
                  <div className="flex justify-between text-sm">
                    <div>
                      <p className="font-medium text-ink-900">{item.item_name} ×{item.quantity}</p>
                      {item.attendee_first_name && (
                        <p className="text-xs text-ink-400 mt-0.5">
                          {item.attendee_first_name} {item.attendee_last_name} · {item.attendee_email}
                        </p>
                      )}
                    </div>
                    <span className="text-ink-900">{formatCents(item.total_cents, fullOrder.currency)}</span>
                  </div>
                </div>
              ))}
              {addonItems.map(item => (
                <div key={item.id} className="py-3">
                  <div className="flex justify-between text-sm">
                    <p className="text-ink-600">{item.item_name} ×{item.quantity}</p>
                    <span className="text-ink-900">{formatCents(item.total_cents, fullOrder.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment */}
          {payment && (
            <div className="rounded-xl border border-ink-200 bg-white p-6">
              <h2 className="text-base font-semibold text-ink-900 mb-4">Payment</h2>
              <div className="text-sm text-ink-600 space-y-2">
                <div className="flex justify-between">
                  <span className="text-ink-400">Gateway</span>
                  <span className="capitalize">{payment.gateway}</span>
                </div>
                {payment.gateway_payment_id && (
                  <div className="flex justify-between">
                    <span className="text-ink-400">Transaction ID</span>
                    <span className="font-mono text-xs">{payment.gateway_payment_id}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink-400">Status</span>
                  <span className="capitalize">{payment.status}</span>
                </div>
                {payment.receipt_url && (
                  <div className="flex justify-between">
                    <span className="text-ink-400">Receipt</span>
                    <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer" className="text-gold-500 hover:underline text-xs">
                      View receipt
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Financial breakdown */}
          <div className="rounded-xl border border-ink-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">Breakdown</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-600">Subtotal</span>
                <span>{formatCents(fullOrder.subtotal_cents + fullOrder.addon_total_cents, fullOrder.currency)}</span>
              </div>
              {fullOrder.discount_cents > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount</span>
                  <span>−{formatCents(fullOrder.discount_cents, fullOrder.currency)}</span>
                </div>
              )}
              {fullOrder.tax_cents > 0 && (
                <div className="flex justify-between text-ink-400">
                  <span>Tax</span>
                  <span>{formatCents(fullOrder.tax_cents, fullOrder.currency)}</span>
                </div>
              )}
              <div className="border-t border-ink-100 pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCents(fullOrder.total_cents, fullOrder.currency)}</span>
              </div>
              <div className="border-t border-ink-100 pt-2 space-y-1 text-ink-400">
                <div className="flex justify-between">
                  <span>Platform fee</span>
                  <span>−{formatCents(fullOrder.platform_fee_cents, fullOrder.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Processing fee</span>
                  <span>−{formatCents(fullOrder.processing_fee_cents, fullOrder.currency)}</span>
                </div>
              </div>
              <div className="border-t border-ink-100 pt-2 flex justify-between font-bold text-green-700">
                <span>Your Revenue</span>
                <span>{formatCents(organiserRevenue, fullOrder.currency)}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-400">Payouts processed after the event</p>
          </div>

          {/* Order metadata */}
          <div className="rounded-xl border border-ink-200 bg-white p-5 text-xs text-ink-400 space-y-1.5">
            <div className="flex justify-between">
              <span>Placed</span>
              <span>{new Date(fullOrder.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            {fullOrder.confirmed_at && (
              <div className="flex justify-between">
                <span>Confirmed</span>
                <span>{new Date(fullOrder.confirmed_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Fee mode</span>
              <span className="capitalize">{fullOrder.fee_pass_type.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
