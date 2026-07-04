import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listRefundsForAdmin, REFUND_STATUS_FILTERS, type RefundStatusFilter } from '@/lib/admin/refunds'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Refunds | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ q?: string; page?: string; status?: string }>

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-400/15 text-amber-300',
  processing: 'bg-sky-400/15 text-sky-300',
  failed: 'bg-rose-500/15 text-rose-300',
  completed: 'bg-emerald-400/15 text-emerald-300',
  cancelled: 'bg-white/10 text-white/50',
}

const FILTER_LABELS: Record<RefundStatusFilter, string> = {
  open: 'Open',
  all: 'All',
  pending: 'Pending',
  processing: 'Processing',
  failed: 'Failed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default async function AdminRefundsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.refunds.process')) redirect('/admin')

  const sp = await searchParams
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1
  const status = sp.status?.trim() || 'open'

  await recordAuditEvent({
    action: 'admin.refunds.view',
    session,
    metadata: { search: search ?? null, status, page },
  })

  const { rows, hasMore, statusFilter } = await listRefundsForAdmin({ search, status, page })

  const pageHref = (next: number) =>
    `/admin/refunds?${new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(statusFilter !== 'open' ? { status: statusFilter } : {}),
      page: String(next),
    }).toString()}`

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Refunds</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Every refund that still needs attention across the platform. Open the order to issue or retry a refund.
          A failed refund needs an operator retry. Every refund action is recorded in the audit log.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {REFUND_STATUS_FILTERS.map(f => {
          const active = f === statusFilter
          return (
            <Link
              key={f}
              href={`/admin/refunds?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(f !== 'open' ? { status: f } : {}) }).toString()}`}
              className={`min-h-[44px] rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                active
                  ? 'bg-[var(--brand-accent)] text-[var(--text-primary)]'
                  : 'border border-white/10 text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {FILTER_LABELS[f]}
            </Link>
          )
        })}
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
        {statusFilter !== 'open' ? <input type="hidden" name="status" value={statusFilter} /> : null}
        <label className="block flex-1 min-w-[240px]">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Order number"
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
          href="/admin/refunds"
          className="min-h-[44px] rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Requested</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/50">
                  No refunds in this view. When a buyer or organiser requests a refund it appears here until it clears.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--brand-accent)] hover:underline">
                      {r.orderNumber ?? 'View order'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/70">{r.eventTitle ?? '-'}</td>
                  <td className="px-4 py-3 text-white/70">{r.organisationName ?? '-'}</td>
                  <td className="px-4 py-3 text-white/70">{money(r.amountCents, r.currency)}</td>
                  <td className="px-4 py-3 text-white/60">{r.reason.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE[r.status] ?? 'bg-white/10 text-white/60'}`}>
                      {r.status}
                    </span>
                    {r.status === 'failed' && r.failureReason ? (
                      <span className="mt-1 block text-[11px] text-rose-300/80">{r.failureReason}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-white/50">{formatDate(r.requestedAt)}</td>
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
            <Link href={pageHref(page - 1)} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white">
              Previous
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={pageHref(page + 1)} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
