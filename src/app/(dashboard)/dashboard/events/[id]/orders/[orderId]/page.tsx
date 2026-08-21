import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Order, OrderItem, Payment } from '@/types/database'
import { getOrderForAdmin } from '@/lib/admin/orders'
import { OrganiserRefundPanel } from './refund-panel'
import { RefundOutcome } from '@/components/refunds/refund-outcome'
import { resolveEventAccess } from '@/lib/organisations/event-access'

const REFUNDABLE_ORDER_STATUSES = new Set(['confirmed', 'partially_refunded'])

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
  // Was MISSING, so a partly refunded order fell through to the raw enum and
  // badged the literal string "partially_refunded" at the organiser.
  partially_refunded: { label: 'Partly refunded', className: 'bg-ink-100 text-ink-600' },
  expired: { label: 'Expired', className: 'bg-ink-100 text-ink-400' },
}

/*
 * THE BADGE HAS TO SURVIVE THE GAP BETWEEN THE REFUND AND THE WEBHOOK.
 *
 * `orders.status` becomes 'refunded' inside reconcile_refund, which runs when
 * Stripe delivers charge.refunded, NOT when the organiser presses Refund. The
 * action revalidates the path and the panel calls router.refresh() immediately,
 * so the page re-renders in the seconds BEFORE the webhook lands and truthfully
 * reports the order as still Confirmed.
 *
 * The founder hit exactly that on production on 21 August: a successful refund,
 * a page still badging "Confirmed", and no way to tell without checking email and
 * then a bank statement. The order row was not wrong; the badge was reading only
 * half the story.
 *
 * So the badge reads the refund rows too. A refund that exists but has not
 * reconciled yet is shown as in progress, which is the honest answer to "did that
 * work?" and, unlike the old silence, is not mistakable for "nothing happened".
 */
function badgeFor(
  orderStatus: string,
  refunds: { status: string }[],
): { label: string; className: string } {
  const settled = STATUS_LABELS[orderStatus]
  if (orderStatus === 'refunded' || orderStatus === 'partially_refunded') {
    return settled ?? { label: orderStatus, className: 'bg-ink-100 text-ink-600' }
  }
  if (refunds.some((r) => r.status === 'pending' || r.status === 'processing')) {
    return { label: 'Refund in progress', className: 'bg-amber-100 text-amber-800' }
  }
  if (refunds.some((r) => r.status === 'completed')) {
    // Completed refund, order not yet reconciled. Say refunded rather than
    // Confirmed: the money has left, and that is what the organiser is asking about.
    return { label: 'Refunded', className: 'bg-ink-100 text-ink-600' }
  }
  return settled ?? { label: orderStatus, className: 'bg-ink-100 text-ink-600' }
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

  /*
   * ACCESS GATE, one shared definition. This was `.eq('owner_id', user.id)`, which
   * locked out an organisation_members manager even though resolveRefundScope and
   * create_refund_request both admit them. The refund control lives on this page, so
   * an owner-only route made the founder's "any organiser can refund" ruling
   * unreachable for a venue with staff. See src/lib/organisations/event-access.ts.
   */
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) notFound()

  // Admin client - organiser is not the buyer, RLS blocks session-client reads on orders/payments
  const { data: order } = await adminClient
    .from('orders')
    .select('*, order_items(*), payments(*)')
    .eq('id', orderId)
    .eq('event_id', eventId)
    .single()

  if (!order) notFound()

  const fullOrder = order as FullOrder

  // Load buyer profile if user order - admin client needed to read another user's profile
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

  /*
   * WHAT WAS ALREADY REFUNDED ON THIS ORDER. Read unconditionally, not only for
   * refundable orders, because the state that most needs explaining is the one
   * AFTER a refund, when the order is no longer refundable at all.
   */
  const { data: refundRowsRaw } = await adminClient
    .from('refunds')
    .select('id, amount_cents, currency, status, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  const refundRows = (refundRowsRaw ?? []) as {
    id: string
    amount_cents: number
    currency: string
    status: string
    created_at: string
  }[]

  const statusInfo = badgeFor(fullOrder.status, refundRows)

  const ticketItems = fullOrder.order_items.filter(i => i.item_type === 'ticket')
  const addonItems = fullOrder.order_items.filter(i => i.item_type === 'addon')

  /*
   * REVENUE, NET OF WHAT HAS BEEN GIVEN BACK.
   *
   * FOUND 21 August 2026 while screenshotting the refund fixes: a FULLY REFUNDED
   * order showed "Your Revenue AUD 100.00". The arithmetic was right for an order
   * nobody had refunded and simply did not know about refunds, so the one number
   * on this page that answers "what did I keep from this sale" said the organiser
   * kept all of it, on a sale they had just handed back in full.
   *
   * Same class as the "AUD NaN" on the orders page: a money figure derived from
   * an incomplete set of inputs. Refunds that are completed or still in flight
   * both count, because neither leaves the money with the organiser.
   */
  const refundedAgainstOrder = refundRows
    .filter((r) => r.status === 'completed' || r.status === 'pending' || r.status === 'processing')
    .reduce((s, r) => s + r.amount_cents, 0)

  /*
   * THE FEES COME BACK IN PROPORTION, SO THE DISPLAY MUST TOO.
   *
   * Subtracting the refund from (total - fees) is the obvious arithmetic and it
   * is wrong: it produced "Your Revenue AUD -6.20" on a fully refunded order,
   * asserting the organiser owed the platform its fee on a sale that no longer
   * exists. reconcile_refund does not work that way. It reverses the fee in
   * proportion to the refund:
   *
   *   v_app_fee := round((platform_fee_cents + processing_fee_cents)
   *                      * p_refund_amount_cents / total_cents)
   *
   * So the honest figure is the organiser's share of what was RETAINED, with the
   * fee taken on the retained part only. A full refund nets to zero, a half
   * refund to half the face value, and no refund is unchanged from before.
   */
  const retainedCents = Math.max(0, fullOrder.total_cents - refundedAgainstOrder)
  const feesOnRetained = fullOrder.total_cents === 0
    ? 0
    : Math.round(
        (fullOrder.platform_fee_cents + fullOrder.processing_fee_cents) *
          (retainedCents / fullOrder.total_cents),
      )
  const organiserRevenue = retainedCents - feesOnRetained

  // Refund panel data (tickets + per-ticket face value). Only loaded/shown for
  // refundable orders; the refund itself is authorised again server-side.
  const refundData = REFUNDABLE_ORDER_STATUSES.has(fullOrder.status)
    ? await getOrderForAdmin(orderId)
    : null

  /*
   * IS THERE ACTUALLY ANYTHING LEFT TO REFUND?
   *
   * The order status alone does not answer this, and that gap is what put the
   * dialog's empty state in front of the founder straight after a successful
   * refund. Between pressing Refund and Stripe delivering charge.refunded, the
   * ORDER is still 'confirmed' while every TICKET on it is already void, so the
   * panel loaded, found nothing refundable, and rendered "There are no refundable
   * tickets on this order" as the first thing on the page.
   *
   * The same predicate the dialog uses, applied one level up, so the control is
   * not rendered at all when it has nothing to offer. The empty state inside the
   * dialog is left exactly as it was: it is correct for the case it was written
   * for, which is an order opened from somewhere else that never had a refundable
   * ticket, and it is no longer reachable by refunding one.
   */
  const REFUNDABLE_TICKET_STATUSES = new Set(['valid', 'scanned'])
  const refundableTickets =
    refundData?.tickets.filter((t) => REFUNDABLE_TICKET_STATUSES.has(t.status)) ?? []

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
              <p><span className="text-ink-400">Name:</span> {buyerName || ':'}</p>
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

          {/*
            * REFUND OUTCOME, ABOVE THE REFUND CONTROL AND SEPARATE FROM IT.
            *
            * Rendered whenever a refund exists, which is what makes the empty
            * state stop doing double duty: the dialog's "there are no refundable
            * tickets" line now only appears for an order that genuinely never had
            * any, because an order that HAS been refunded shows this instead.
            */}
          {refundRows.length > 0 && (
            <RefundOutcome refunds={refundRows} buyerEmail={buyerEmail} />
          )}

          {/* Refund */}
          {refundData && refundableTickets.length > 0 && (
            <OrganiserRefundPanel
              eventId={eventId}
              orderId={orderId}
              currency={fullOrder.currency}
              totalCents={fullOrder.total_cents}
              allFaceCents={refundData.allFaceCents}
              tickets={refundData.tickets}
            />
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
                  <span>EventLinqs fee</span>
                  <span>−{formatCents(fullOrder.platform_fee_cents, fullOrder.currency)}</span>
                </div>
                {/*
                  ONE-FEE-ALLOW: a HISTORICAL order must show what it was actually
                  charged. Orders placed before 15 August 2026 carry a non-zero
                  processing_fee_cents and the organiser is entitled to see it;
                  every order since carries 0 and this row does not render at all.
                  It was unconditional, so a new order displayed a 0.00 line
                  labelled with a fee the platform does not charge.
                */}
                {fullOrder.processing_fee_cents > 0 && (
                  <div className="flex justify-between">
                    {/* ONE-FEE-ALLOW: historical order, gated on a non-zero value. */}
                    <span>Processing fee (historical)</span>
                    <span>−{formatCents(fullOrder.processing_fee_cents, fullOrder.currency)}</span>
                  </div>
                )}
                {refundedAgainstOrder > 0 && (
                  <div className="flex justify-between">
                    <span>Refunded to buyer</span>
                    <span>−{formatCents(refundedAgainstOrder, fullOrder.currency)}</span>
                  </div>
                )}
              </div>
              <div className={`border-t border-ink-100 pt-2 flex justify-between font-bold ${organiserRevenue > 0 ? 'text-green-700' : 'text-ink-600'}`}>
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
              <span>{new Date(fullOrder.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' })}</span>
            </div>
            {fullOrder.confirmed_at && (
              <div className="flex justify-between">
                <span>Confirmed</span>
                <span>{new Date(fullOrder.confirmed_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' })}</span>
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
