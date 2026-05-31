import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { hasCapability } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getOrderForAdmin } from '@/lib/admin/orders'
import { AdminRefundPanel } from './refund-panel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Order | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  partially_refunded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  refunded: 'border-red-500/30 bg-red-500/10 text-red-200',
  pending: 'border-white/15 bg-white/[0.04] text-white/60',
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const session = await requireAdminSession()
  if (!hasCapability(session.admin.role, 'admin.refunds.process')) redirect('/admin')

  const { orderId } = await params
  const order = await getOrderForAdmin(orderId)
  if (!order) notFound()

  await recordAuditEvent({
    action: 'admin.order.view',
    targetType: 'order',
    targetId: orderId,
    session,
    metadata: { order_number: order.order_number },
  })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Orders</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{order.order_number}</h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${
              STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
            }`}
          >
            {order.status.replace('_', ' ')}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/60">
          {order.event_title ?? 'Event'} | {order.buyer_email ?? 'Guest'} | {money(order.total_cents, order.currency)}
        </p>
        <Link href="/admin/orders" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-white/50 hover:text-white">
          Back to orders
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <AdminRefundPanel
            orderId={order.id}
            currency={order.currency}
            totalCents={order.total_cents}
            allFaceCents={order.allFaceCents}
            tickets={order.tickets}
          />
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold">Refund history</h2>
          {order.refunds.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">No refunds on this order yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {order.refunds.map(r => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-white/[0.08] px-3 py-2 text-sm"
                >
                  <span className="text-white/70">
                    {money(r.amount_cents, r.currency)}
                    <span className="ml-2 text-white/40">{r.reason.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="text-white/50">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
