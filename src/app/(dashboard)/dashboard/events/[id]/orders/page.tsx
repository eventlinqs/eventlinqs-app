import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OrderTable } from '@/components/orders/order-table'
import { RevenueSummary } from '@/components/orders/revenue-summary'
import { aggregateGmv } from '@/lib/admin/analytics'
import type { Order } from '@/types/database'
import { resolveEventAccess } from '@/lib/organisations/event-access'

/*
 * ONE LIST, READ BY BOTH THE QUERY AND THE TYPE.
 *
 * The columns named here are the columns the page may read. Because
 * OrderSummaryRow is derived from the same tuple, adding a field to the summary
 * arithmetic without adding it here does not compile, and a column fetched but
 * never used is visible in one place instead of being hunted across the file.
 *
 * platform_fee_cents and processing_fee_cents are in this list because the
 * revenue card sums them. They were missing on 21 August and the card rendered
 * "AUD NaN" for all three derived figures.
 */
const ORDER_SUMMARY_COLUMNS = [
  'id',
  'order_number',
  'status',
  'currency',
  'total_cents',
  'platform_fee_cents',
  'processing_fee_cents',
  'created_at',
  'user_id',
  'guest_email',
  'guest_name',
] as const

const ORDER_SUMMARY_SELECT = `${ORDER_SUMMARY_COLUMNS.join(', ')}, order_items(id, item_type, quantity)`

type OrderSummaryRow = Pick<Order, (typeof ORDER_SUMMARY_COLUMNS)[number]> & {
  order_items: { id: string; item_type: string; quantity: number }[]
}

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

  /*
   * ACCESS GATE, one shared definition. This was `.eq('owner_id', user.id)`, which
   * locked out an organisation_members manager even though resolveRefundScope and
   * create_refund_request both admit them. The refund control lives on this page, so
   * an owner-only route made the founder's "any organiser can refund" ruling
   * unreachable for a venue with staff. See src/lib/organisations/event-access.ts.
   */
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) notFound()

  // Fetch all orders for this event - admin client bypasses RLS (organiser is not the buyer)
  //
  // EXPLICIT COLUMNS, NOT (*). The result of this query is passed to <OrderTable>,
  // a CLIENT component, so every column selected here is serialised into the RSC
  // payload and readable in the browser with view-source. `select('*')` shipped
  // all 25 columns of every order for a table that renders 8 of them, including
  // user_id, metadata, reservation_id, discount_code_id and the full fee
  // breakdown. The organiser is entitled to their own event's order data, so this
  // is not a cross-tenant leak; it is unnecessary width at a trust boundary, and
  // width at that boundary is what an XSS on this page, or a Session Replay
  // recording of it, would carry away. ASVS 8.2.3 (field-level authorisation).
  //
  // user_id IS still needed: the buyer name/email join below resolves it against
  // profiles. It is used and then dropped, never rendered.
  const { data: orders } = await adminClient
    .from('orders')
    .select(ORDER_SUMMARY_SELECT)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  /*
   * TYPED TO WHAT WAS SELECTED, NOT TO THE WHOLE ROW.
   *
   * This used to read `as (Order & { order_items: ... })[]`, and `Order` is the
   * FULL orders row. The select asked for nine columns, so the cast asserted the
   * presence of every column it did not fetch. That is why reading
   * `o.platform_fee_cents` compiled cleanly and arrived `undefined`, and why the
   * revenue card rendered "AUD NaN" for platform fees, processing fees and net
   * revenue while gross sales, which reads the selected `total_cents`, was right.
   * Found on production on 21 August by an organiser refunding a real order.
   *
   * Narrowing the type to exactly the selected columns is what stops the next one:
   * consuming a field this query does not fetch is now a COMPILE ERROR rather than
   * a number that silently becomes NaN three components later.
   */
  const ordersData = (orders ?? []) as unknown as OrderSummaryRow[]

  // Build display orders (join buyer name/email from profile or guest fields)
  const userIds = ordersData.filter(o => o.user_id).map(o => o.user_id!)
  const profileMap = new Map<string, { full_name: string | null; email: string }>()

  if (userIds.length > 0) {
    // Admin client needed - organiser reading other users' profiles
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  /*
   * BUILT FIELD BY FIELD, NOT BY SPREADING THE ROW.
   *
   * This used to be `{ ...o, buyer_name, buyer_email, ticket_count }`. A spread
   * ships whatever the query happened to select into the RSC payload, so the
   * moment platform_fee_cents and processing_fee_cents were added to fix the NaN
   * on the revenue card, the spread would have serialised the fee breakdown into
   * the browser: exactly the width the note above this query exists to prevent,
   * re-introduced as a side effect of an unrelated fix.
   *
   * The fee columns are read on the SERVER for the revenue totals and stop here.
   * Naming the fields keeps the two concerns independent: what the page computes
   * and what the client component is given.
   */
  const displayOrders = ordersData.map(o => {
    const profile = o.user_id ? profileMap.get(o.user_id) : undefined
    const ticket_count = o.order_items
      .filter(i => i.item_type === 'ticket')
      .reduce((s, i) => s + i.quantity, 0)
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      currency: o.currency,
      total_cents: o.total_cents,
      created_at: o.created_at,
      buyer_name: profile?.full_name ?? o.guest_name ?? '',
      buyer_email: profile?.email ?? o.guest_email ?? '',
      ticket_count,
    }
  })

  // Stats. Paid orders are the ones where a sale occurred (confirmed,
  // partially_refunded, refunded); pending/cancelled/expired never count.
  const confirmedOrders = ordersData.filter(o =>
    ['confirmed', 'partially_refunded', 'refunded'].includes(o.status)
  )

  // PAY-02: value revenue NET of completed refunds, via the same audited
  // aggregator as /admin/analytics. Summing total_cents over the paid statuses
  // counted a fully refunded order at full value; we now subtract completed
  // refunds so a full refund nets to zero and a partial nets to the retained
  // amount.
  const paidOrderIds = confirmedOrders.map(o => o.id)
  let eventRefunds: { amount_cents: number; status: string }[] = []
  if (paidOrderIds.length > 0) {
    const { data: refundRows } = await adminClient
      .from('refunds')
      .select('amount_cents, status')
      .in('order_id', paidOrderIds)
    eventRefunds = (refundRows ?? []) as { amount_cents: number; status: string }[]
  }
  const gmv = aggregateGmv(
    confirmedOrders.map(o => ({
      total_cents: o.total_cents,
      platform_fee_cents: o.platform_fee_cents,
      status: o.status,
    })),
    eventRefunds,
  )
  const grossRevenue = gmv.grossGmvCents
  const refundedRevenue = gmv.refundedCents
  const totalRevenue = gmv.netGmvCents // net of refunds - shown on the Revenue card
  const totalPlatformFees = confirmedOrders.reduce((s, o) => s + o.platform_fee_cents, 0)
  const totalProcessingFees = confirmedOrders.reduce((s, o) => s + o.processing_fee_cents, 0)
  const ticketsSold = confirmedOrders.reduce((s, o) => {
    return s + o.order_items.filter(i => i.item_type === 'ticket').reduce((ss, i) => ss + i.quantity, 0)
  }, 0)

  const totalCapacity = (event.ticket_tiers ?? []).reduce((s: number, t: { total_capacity: number }) => s + t.total_capacity, 0)
  const remaining = totalCapacity - ticketsSold

  const currency = ordersData[0]?.currency ?? 'AUD'

  // Fetch waitlist counts per tier (admin client - organiser reading buyer waitlist data)
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
        <Link href={`/dashboard/events/${eventId}/edit`} className="text-sm text-ink-400 hover:text-ink-600">
          ← Back to Event
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Orders</h1>
        <span className="text-ink-400 text-sm">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      {/* Export actions: orders report carries the financial and buyer
          transaction detail; attendees has its own list and door list. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <a
          href={`/dashboard/events/${eventId}/orders/export?format=csv`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100"
        >
          Export orders CSV
        </a>
        <a
          href={`/dashboard/events/${eventId}/orders/export?format=xlsx`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100"
        >
          Export orders Excel
        </a>
        <Link
          href={`/dashboard/events/${eventId}/attendees`}
          className="inline-flex min-h-[44px] items-center px-2 py-2 text-sm font-medium text-gold-800 underline hover:text-gold-700"
        >
          Attendee list and door list
        </Link>
      </div>

      {/* Stat cards */}
      <div className={`grid grid-cols-2 gap-4 mb-6 ${event.waitlist_enabled ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wider">Total Orders</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{confirmedOrders.length}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold text-ink-900 mt-1 tabular-nums">
            {new Intl.NumberFormat('en-AU', {
              style: 'currency',
              currency: currency.toUpperCase(),
              currencyDisplay: 'code',
            }).format(totalRevenue / 100)}
          </p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wider">Tickets Sold</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{ticketsSold}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs text-ink-400 uppercase tracking-wider">Remaining</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{remaining}</p>
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
            grossCents={grossRevenue}
            platformFeeCents={totalPlatformFees}
            processingFeeCents={totalProcessingFees}
            refundedCents={refundedRevenue}
            currency={currency}
          />

          <div className="mt-4 flex gap-2">
            <Link
              href={`/dashboard/events/${eventId}/discounts`}
              className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-center text-xs font-medium text-ink-600 hover:bg-ink-100"
            >
              Discount Codes
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
