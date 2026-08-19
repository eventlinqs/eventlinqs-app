import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listUnfulfilledPaidOrders } from '@/lib/admin/unfulfilled-orders'
import { SettleButton } from './settle-button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Unfulfilled paid orders | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

function when(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Melbourne',
  }).format(new Date(iso))
}

export default async function AdminUnfulfilledOrdersPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.refunds.process')) redirect('/admin')

  const result = await listUnfulfilledPaidOrders()

  await recordAuditEvent({
    action: 'admin.orders.unfulfilled.view',
    session,
    metadata: result.ok
      ? { rows: result.rows.length, candidates_checked: result.candidatesChecked }
      : { failed: result.reason, detail: result.detail },
  })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Money taken, no ticket</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Buyers whose card was charged and who hold no ticket. This happens when confirmation is refused
          after the payment succeeded, which the platform now does deliberately rather than seat two people
          in one chair. The refund below is the resolution: it pays the buyer back and closes the order.
        </p>
        <p className="mt-3 text-sm text-white/50">
          Every row here is checked against Stripe, not against our own payment status, because a failed
          confirmation and an abandoned checkout leave an identical row in our database and only the payment
          processor can tell them apart.
        </p>
        <p className="mt-4">
          <Link href="/admin/orders" className="text-sm text-[var(--brand-accent)] hover:underline">
            Back to all orders
          </Link>
        </p>
      </header>

      {!result.ok ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100"
        >
          <p className="font-semibold">This list could not be checked, so it is not empty, it is unknown.</p>
          <p className="mt-2 text-red-100/80">
            {result.reason === 'stripe_unconfigured'
              ? 'Stripe is not configured on this deployment, so no charge can be verified.'
              : 'The check failed before it could finish.'}
          </p>
          <p className="mt-2 font-mono text-xs text-red-100/70">{result.detail}</p>
          <p className="mt-3 text-red-100/80">
            Do not read a clean page as a clean platform. Fix the cause and reload.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-white/50">
            {result.candidatesChecked} payment{result.candidatesChecked === 1 ? '' : 's'} verified against
            Stripe, {result.rows.length} outstanding
          </p>

          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Taken</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Charged</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Resolve</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-white/50">
                      Nobody is out of pocket. {result.candidatesChecked} pending payment
                      {result.candidatesChecked === 1 ? ' was' : 's were'} checked against Stripe to say so.
                    </td>
                  </tr>
                ) : (
                  result.rows.map(r => {
                    const outstanding = r.capturedCents - r.alreadyRefundedCents
                    return (
                      <tr key={r.orderId} className="border-t border-white/[0.06] align-top hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <Link
                            href={`/admin/orders/${r.orderId}`}
                            className="text-[var(--brand-accent)] hover:underline"
                          >
                            {r.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-white/60">{when(r.createdAt)}</td>
                        <td className="px-4 py-4 text-white/70">{r.buyerEmail ?? 'Account holder'}</td>
                        <td className="px-4 py-4 text-white/70">
                          {r.eventId && r.eventTitle ? (
                            <Link href={`/admin/events/${r.eventId}`} className="hover:underline">
                              {r.eventTitle}
                            </Link>
                          ) : (
                            r.eventTitle ?? '-'
                          )}
                        </td>
                        <td className="px-4 py-4 text-white/80">
                          {money(outstanding, r.currency)}
                          {r.alreadyRefundedCents > 0 ? (
                            <span className="block text-xs text-white/45">
                              {money(r.capturedCents, r.currency)} captured, {money(r.alreadyRefundedCents, r.currency)} already back
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-white/50">{r.paymentIntentId}</td>
                        <td className="px-4 py-4">
                          <SettleButton
                            orderId={r.orderId}
                            amountLabel={money(outstanding, r.currency)}
                            buyerLabel={r.buyerEmail ?? 'the buyer'}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
