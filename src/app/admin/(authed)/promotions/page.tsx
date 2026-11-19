import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { formatMoneyDisplay } from '@/lib/money/format'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { offersOf, ordersQueue, reconcileAwaiting } from '@/lib/promotions/promotions'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { markOrderDoneAction, setOfferPriceAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Promotions | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * PROMOTIONS IN ADMIN (Train C, rows 12 and 13): the price of each featured slot and each service, which Lawal sets
 * here (an empty price is not on sale, the project manager's 13:14), and the queue of organisers' orders, each read
 * back from Stripe while it awaits payment.
 */

const FIELD = 'block min-h-[44px] w-32 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 text-sm text-[var(--admin-ink)]'
const BUTTON = 'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET = 'inline-flex min-h-[44px] items-center rounded-full border border-[var(--admin-line)] px-4 text-sm font-semibold text-[var(--admin-soft)] hover:border-[var(--admin-line-strong)] hover:text-[var(--admin-ink)]'

const STATUS_WORDS = { awaiting_payment: 'Awaiting payment', paid: 'Paid, to do', cancelled: 'Cancelled', done: 'Done' } as const

export default async function AdminPromotionsPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.pricing.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.promotions.view', session })
  const { said } = await searchParams
  const admin = createAdminClient()
  // The reconcile is a convenience on view: a payments key missing from an environment (the admin sweep of 15 November
  // 2026 on TEST: 'STRIPE_SECRET_KEY is not set', a 500) never takes the page down; the hourly reconcile still runs.
  await (async () => reconcileAwaiting(admin, getStripeClient(), null, new Date()))().catch(() => 0)
  const [offers, orders, open] = await Promise.all([offersOf(admin).catch(() => null), ordersQueue(admin).catch(() => null), isFeatureEnabled('paid_promotions')])
  if (offers === null || orders === null) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Promotions</h1>
        <p data-state="refusal" className="mt-4 max-w-2xl text-sm text-[var(--admin-soft)]">
          The prices and orders could not be read. If migration 20261027140501 is not yet applied, this page reads nothing until it is.
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Promotions</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Featured slots and the services menu. Set a price to put one on sale; leave it empty and organisers see it as not on sale yet.
        </p>
      </header>

      <p data-switch={open ? 'on' : 'off'} className="mb-6 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
        {open
          ? 'Paid promotions are on: organisers see Promote and can order what has a price.'
          : 'Paid promotions are off: organisers see no Promote page, nothing can be ordered and no Featured row shows. Set the prices first, then turn on paid_promotions in Feature flags.'}
      </p>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
          {said}
        </p>
      )}

      <section data-section="offers" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Prices</h2>
        <ul className="mt-4 space-y-4">
          {offers.map((o) => (
            <li key={o.id} data-offer={o.key} data-on-sale={o.priceCents === null ? 'no' : 'yes'} className="rounded-lg border border-[var(--admin-line)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-[var(--admin-ink)]">{o.name}</p>
                <p className="text-sm text-[var(--admin-soft)]">{o.priceCents === null ? 'Not on sale' : formatMoneyDisplay(o.priceCents, 'AUD')}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--admin-soft)]">
                {o.description}
                {o.slots === null ? '' : ` ${o.slots} slots, a week each.`}
              </p>
              <form action={setOfferPriceAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={o.id} />
                <label className="text-sm text-[var(--admin-soft)]">
                  Price in dollars
                  <input
                    name="price"
                    inputMode="decimal"
                    defaultValue={o.priceCents === null ? '' : (o.priceCents / 100).toFixed(2)}
                    placeholder="Not on sale"
                    className={`mt-1 ${FIELD}`}
                  />
                </label>
                <button type="submit" className={BUTTON}>
                  Save price
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section data-section="orders" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Orders</h2>
        {orders.length === 0 ? (
          <p data-state="empty" className="mt-3 text-sm text-[var(--admin-soft)]">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((o) => (
              <li key={o.id} data-order={o.id} data-status={o.status} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-line)] p-4">
                <div>
                  <p className="font-semibold text-[var(--admin-ink)]">
                    {o.offerName}
                    {o.eventTitle === null ? '' : `, for ${o.eventTitle}`}
                  </p>
                  <p className="text-sm text-[var(--admin-soft)]">
                    {o.organisationName}, {formatMoneyDisplay(o.amountCents, 'AUD')}, ordered {formatPlatformDateTime(o.createdAt)}
                    {o.endsAt === null ? '' : `, featured until ${formatPlatformDateTime(o.endsAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--admin-soft)]">{STATUS_WORDS[o.status]}</span>
                  {o.status === 'paid' ? (
                    <form action={markOrderDoneAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className={QUIET}>
                        Mark done
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
