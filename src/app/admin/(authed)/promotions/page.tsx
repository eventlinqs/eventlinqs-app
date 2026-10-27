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

const FIELD = 'block min-h-[44px] w-32 rounded-lg border border-white/15 bg-white/[0.02] px-3 text-sm text-white'
const BUTTON = 'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET = 'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-4 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white'

const STATUS_WORDS = { awaiting_payment: 'Awaiting payment', paid: 'Paid, to do', cancelled: 'Cancelled', done: 'Done' } as const

export default async function AdminPromotionsPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.pricing.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.promotions.view', session })
  const { said } = await searchParams
  const admin = createAdminClient()
  await reconcileAwaiting(admin, getStripeClient(), null, new Date()).catch(() => 0)
  const [offers, orders, open] = await Promise.all([offersOf(admin).catch(() => null), ordersQueue(admin).catch(() => null), isFeatureEnabled('paid_promotions')])
  if (offers === null || orders === null) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Promotions</h1>
        <p data-state="refusal" className="mt-4 max-w-2xl text-sm text-white/70">
          The prices and orders could not be read. If migration 20261027140501 is not yet applied, this page reads nothing until it is.
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Promotions</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Featured slots and the services menu. Set a price to put one on sale; leave it empty and organisers see it as not on sale yet.
        </p>
      </header>

      <p data-switch={open ? 'on' : 'off'} className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
        {open
          ? 'Paid promotions are on: organisers see Promote and can order what has a price.'
          : 'Paid promotions are off: organisers see no Promote page, nothing can be ordered and no Featured row shows. Set the prices first, then turn on paid_promotions in Feature flags.'}
      </p>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}

      <section data-section="offers" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Prices</h2>
        <ul className="mt-4 space-y-4">
          {offers.map((o) => (
            <li key={o.id} data-offer={o.key} data-on-sale={o.priceCents === null ? 'no' : 'yes'} className="rounded-lg border border-white/[0.08] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-white">{o.name}</p>
                <p className="text-sm text-white/70">{o.priceCents === null ? 'Not on sale' : formatMoneyDisplay(o.priceCents, 'AUD')}</p>
              </div>
              <p className="mt-1 text-sm text-white/60">
                {o.description}
                {o.slots === null ? '' : ` ${o.slots} slots, a week each.`}
              </p>
              <form action={setOfferPriceAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={o.id} />
                <label className="text-sm text-white/70">
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

      <section data-section="orders" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Orders</h2>
        {orders.length === 0 ? (
          <p data-state="empty" className="mt-3 text-sm text-white/70">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((o) => (
              <li key={o.id} data-order={o.id} data-status={o.status} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-4">
                <div>
                  <p className="font-semibold text-white">
                    {o.offerName}
                    {o.eventTitle === null ? '' : `, for ${o.eventTitle}`}
                  </p>
                  <p className="text-sm text-white/60">
                    {o.organisationName}, {formatMoneyDisplay(o.amountCents, 'AUD')}, ordered {formatPlatformDateTime(o.createdAt)}
                    {o.endsAt === null ? '' : `, featured until ${formatPlatformDateTime(o.endsAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/70">{STATUS_WORDS[o.status]}</span>
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
