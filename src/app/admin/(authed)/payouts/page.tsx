import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { listOrgsForPayouts, getPayoutSummary, PAYOUT_CURRENCY } from '@/lib/admin/payouts'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
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
  title: 'Payouts | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ q?: string; page?: string }>

function money(cents: number, currency = PAYOUT_CURRENCY): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

const PAYOUT_STATUS_BADGE: Record<string, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  on_hold: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  restricted: 'border-red-500/30 bg-red-500/10 text-red-200',
}

export default async function AdminPayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.payouts.disburse')) redirect('/admin')

  const sp = await searchParams
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1

  await recordAuditEvent({
    action: 'admin.payouts.view',
    session,
    metadata: { search: search ?? null, page },
  })

  const [summary, { rows, hasMore }] = await Promise.all([
    getPayoutSummary(),
    listOrgsForPayouts({ search, page }),
  ])

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Finance</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Payouts</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Organiser funds are held by the platform and disbursed automatically after each event.
          Held balances, reserve holds, and transfer history below. Force a disbursement of matured
          event funds or void a failed transfer. Every action is recorded in the audit log.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile label="Available across organisers" value={money(summary.totalAvailableCents)} status="ok" />
        <AdminStatTile label="On reserve hold" value={money(summary.totalOnHoldCents)} status={summary.totalOnHoldCents > 0 ? 'warn' : 'pending'} />
        <AdminStatTile label="Payouts pending" value={summary.pendingCount} status={summary.pendingCount > 0 ? 'pending' : 'ok'} />
        <AdminStatTile label="Payouts paid" value={summary.paidCount} status="ok" />
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
        <label className="block flex-1 min-w-[240px]">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Organiser name"
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
          href="/admin/payouts"
          className="min-h-[44px] rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Reset
        </Link>
      </form>

      {/* Below lg this stops being a table and each organiser becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={ADMIN_TABLE_WRAP}>
        <table className={`${ADMIN_TABLE} lg:min-w-[760px]`}>
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Payout status</th>
              <th className="px-4 py-3 font-medium text-right">Available</th>
              <th className="px-4 py-3 font-medium text-right">On hold</th>
              <th className="px-4 py-3 font-medium text-right">Pending</th>
              <th className="px-4 py-3 font-medium">Last payout</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {rows.length === 0 ? (
              <tr className={ADMIN_EMPTY_ROW}>
                <td colSpan={6} className={ADMIN_EMPTY_CELL}>No organisers match this search.</td>
              </tr>
            ) : (
              rows.map(o => (
                <tr key={o.id} className={ADMIN_ROW}>
                  <td className={ADMIN_CELL_NAME}>
                    <Link
                      href={`/admin/payouts/${o.id}`}
                      className={`${ADMIN_ROW_CONTROL} font-medium text-[var(--brand-accent)] hover:underline`}
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className={ADMIN_CELL}>
                    <span className={ADMIN_CELL_LABEL}>Payout status</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${PAYOUT_STATUS_BADGE[o.payoutStatus] ?? 'border-white/15 bg-white/[0.04] text-white/60'}`}>
                      {o.payoutStatus}
                    </span>
                  </td>
                  <td className={`${ADMIN_CELL} text-white/80 lg:text-right`}>
                    <span className={ADMIN_CELL_LABEL}>Available</span>
                    {money(o.availableCents)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/60 lg:text-right`}>
                    <span className={ADMIN_CELL_LABEL}>On hold</span>
                    {money(o.onHoldCents)}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/60 lg:text-right`}>
                    <span className={ADMIN_CELL_LABEL}>Pending</span>
                    {o.pendingCount || '-'}
                  </td>
                  <td className={`${ADMIN_CELL} text-white/60`}>
                    <span className={ADMIN_CELL_LABEL}>Last payout</span>
                    {o.lastPayoutAt
                      ? `${new Date(o.lastPayoutAt).toLocaleDateString('en-AU', { dateStyle: 'medium', timeZone: PLATFORM_TIME_ZONE })} (${o.lastPayoutStatus})`
                      : '-'}
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
            <Link href={`/admin/payouts?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page - 1) }).toString()}`} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white">Previous</Link>
          ) : null}
          {hasMore ? (
            <Link href={`/admin/payouts?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page + 1) }).toString()}`} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/[0.06] hover:text-white">Next</Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
