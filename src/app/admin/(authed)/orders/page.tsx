import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listOrdersForAdmin } from '@/lib/admin/orders'
import {
  ADMIN_CELL,
  ADMIN_CELL_LABEL,
  ADMIN_CELL_NAME,
  ADMIN_EMPTY_CELL,
  ADMIN_EMPTY_ROW,
  ADMIN_ROW,
  ADMIN_ROW_CONTROL,
  ADMIN_TABLE,
  ADMIN_TABLE_WRAP,
  ADMIN_TBODY,
  ADMIN_THEAD,
} from '@/components/admin/table-card'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Orders | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ q?: string; page?: string }>

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.refunds.process')) redirect('/admin')

  const sp = await searchParams
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1

  await recordAuditEvent({
    action: 'admin.orders.view',
    session,
    metadata: { search: search ?? null, page },
  })

  const { rows, hasMore } = await listOrdersForAdmin({ search, page })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Find an order to view its tickets and issue a refund. Search by order number or buyer email.
          Every refund is recorded in the audit log.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/admin/orders/unfulfilled" className="text-[var(--brand-accent)] hover:underline">
            Money taken, no ticket
          </Link>
          <span className="text-white/50"> - buyers charged who hold no ticket, checked against Stripe.</span>
        </p>
      </header>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
        <label className="block flex-1 min-w-[240px]">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Order number or buyer email"
            defaultValue={search ?? ''}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
        <button
          type="submit"
          className="min-h-[44px] rounded-md bg-[var(--brand-accent)] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]"
        >
          Search
        </button>
        <Link
          href="/admin/orders"
          className="min-h-[44px] rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Reset
        </Link>
      </form>

      {/* Below lg this stops being a table and each order becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={ADMIN_TABLE_WRAP}>
        <table className={`${ADMIN_TABLE} lg:min-w-[720px]`}>
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Buyer</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {rows.length === 0 ? (
              <tr className={ADMIN_EMPTY_ROW}>
                <td colSpan={5} className={ADMIN_EMPTY_CELL}>
                  No orders match this search.
                </td>
              </tr>
            ) : (
              rows.map(o => (
                <tr key={o.id} className={ADMIN_ROW}>
                  <td className={ADMIN_CELL_NAME}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className={`${ADMIN_ROW_CONTROL} font-medium text-[var(--brand-accent)] hover:underline`}
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Event</span>
                    {o.event_title ?? '-'}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Buyer</span>
                    {o.buyer_email ?? '-'}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/70`}>
                    <span className={ADMIN_CELL_LABEL}>Total</span>
                    {money(o.total_cents, o.currency)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/60`}>
                    <span className={ADMIN_CELL_LABEL}>Status</span>
                    {o.status.replace(/_/g, ' ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/50">
        <span>Page {page}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) }).toString()}`}
              className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white"
            >
              Previous
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={`/admin/orders?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) }).toString()}`}
              className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
