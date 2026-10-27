import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { formatMoneyDisplay } from '@/lib/money/format'
import { formatPlatformDate } from '@/lib/dates/event-time'
import { confirmPaid, offersOf, promotableEvents, reconcileAwaiting } from '@/lib/promotions/promotions'
import { orderPromotionAction } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Promote | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * PROMOTE YOUR LISTINGS (Train C, rows 12 and 13): featured slots on the homepage and the city pages, labelled Featured,
 * and the services menu, each at the price Lawal sets in admin; an offer without a price says it is not on sale yet.
 * Payment is Stripe Checkout; the order is confirmed only from Stripe's own answer.
 */
export default async function PromotePage({ searchParams }: { searchParams: Promise<{ paid?: string; cancelled?: string; problem?: string; org?: string }> }) {
  const query = await searchParams
  const scope = await resolveOrganiserScope(query.org)
  if (!scope.ok) redirect(scope.status === 401 ? '/login?next=/dashboard/promote' : '/dashboard')
  const admin = createAdminClient()
  const now = new Date()
  const orgId = scope.org.organisationId

  let said: string | null = null
  if (typeof query.paid === 'string' && query.paid !== '') {
    const done = await confirmPaid(admin, getStripeClient(), { sessionId: query.paid, organisationId: orgId, now }).catch(() => null)
    said =
      done === null
        ? 'Your payment is being checked with Stripe. It shows here once Stripe confirms it.'
        : done.state === 'refused'
          ? done.reason
          : 'Paid. Your order is with the EventLinqs team.'
  } else if (query.cancelled === '1') {
    said = 'Nothing was charged.'
  } else if (typeof query.problem === 'string') {
    said = query.problem
  }
  await reconcileAwaiting(admin, getStripeClient(), orgId, now).catch(() => 0)

  const [offers, events, orders] = await Promise.all([
    offersOf(admin).catch(() => null),
    promotableEvents(admin, orgId, now).catch(() => []),
    admin
      .from('promotion_orders')
      .select('id, status, amount_cents, created_at, ends_at, promotion_offers(name), events(title)')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  type Named = { name?: string; title?: string }
  const one = (x: Named | Named[] | null): Named | null => (Array.isArray(x) ? (x[0] ?? null) : x)

  if (offers === null) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold text-ink-900">Promote</h1>
        <p data-state="refusal" className="rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-600">
          The promotions menu could not be shown just now. Nothing was ordered or charged.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Promote</h1>
        <p className="mt-2 text-sm text-ink-600">
          Put a listing in front of more people. A featured listing is always labelled Featured, so nobody mistakes it for an unpaid listing.
        </p>
      </div>

      {said === null ? null : (
        <p role="status" data-said className="rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-900">
          {said}
        </p>
      )}

      {events.length === 0 ? (
        <p data-state="no-listings" className="rounded-lg border border-ink-200 bg-white p-4 text-sm text-ink-600">
          You have no published listings still to come, so there is nothing to promote yet.
        </p>
      ) : null}

      <ul className="space-y-4">
        {offers.map((o) => (
          <li key={o.id} data-offer={o.key} data-on-sale={o.priceCents === null ? 'no' : 'yes'} className="rounded-xl border border-ink-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink-900">{o.name}</h2>
              <p className="text-sm font-semibold text-ink-900">{o.priceCents === null ? 'Not on sale yet' : formatMoneyDisplay(o.priceCents, 'AUD')}</p>
            </div>
            <p className="mt-1 text-sm text-ink-600">{o.description}</p>
            {o.priceCents === null || events.length === 0 ? null : (
              <form action={orderPromotionAction} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="offer" value={o.id} />
                <input type="hidden" name="organisation" value={orgId} />
                <label className="text-sm text-ink-600">
                  For
                  <select name="event" className="mt-1 block min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900">
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" data-press="order" className="inline-flex min-h-[44px] items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white">
                  Order and pay
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <section data-section="orders">
        <h2 className="text-lg font-semibold text-ink-900">Your orders</h2>
        {(orders.data ?? []).length === 0 ? (
          <p data-state="no-orders" className="mt-2 text-sm text-ink-600">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(orders.data ?? []).map((r) => (
              <li key={r.id} data-order={r.id} data-status={r.status} className="flex flex-wrap justify-between gap-2 rounded-lg border border-ink-200 bg-white p-3 text-ink-900">
                <span>
                  {one(r.promotion_offers as Named | Named[] | null)?.name ?? 'An offer'}
                  {one(r.events as Named | Named[] | null)?.title ? `, for ${one(r.events as Named | Named[] | null)?.title}` : ''}
                </span>
                <span className="text-ink-600">
                  {r.status === 'awaiting_payment'
                    ? 'Awaiting payment'
                    : r.status === 'cancelled'
                      ? 'Cancelled'
                      : r.status === 'done'
                        ? 'Done'
                        : r.ends_at
                          ? `Featured until ${formatPlatformDate(r.ends_at)}`
                          : 'Paid, with the team'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
