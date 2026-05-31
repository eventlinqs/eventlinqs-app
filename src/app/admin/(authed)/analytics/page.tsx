import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { hasCapability } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { getAnalyticsDashboard, ANALYTICS_CURRENCY } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Analytics | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: ANALYTICS_CURRENCY, maximumFractionDigits: 0 }).format(cents / 100)
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}

export default async function AdminAnalyticsPage() {
  const session = await requireAdminSession()
  if (!hasCapability(session.admin.role, 'admin.pricing.manage')) redirect('/admin')

  await recordAuditEvent({ action: 'admin.analytics.view', session })

  const { summary, byMonth, topOrganisers } = await getAnalyticsDashboard()
  const maxMonth = Math.max(1, ...byMonth.map(p => p.gmvCents))

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Finance</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Gross merchandise value and platform revenue across the marketplace. GMV counts paid
          orders (confirmed, partially refunded, refunded); net GMV subtracts completed refunds.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile label="Gross GMV" value={money(summary.grossGmvCents)} hint={`${summary.paidOrders} paid orders`} status="ok" />
        <AdminStatTile label="Platform revenue" value={money(summary.platformRevenueCents)} status="ok" />
        <AdminStatTile label="Refunded" value={money(summary.refundedCents)} status={summary.refundedCents > 0 ? 'warn' : 'pending'} />
        <AdminStatTile label="Net GMV" value={money(summary.netGmvCents)} status="ok" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">GMV by month</h2>
          {byMonth.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No paid orders yet.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {byMonth.map(p => (
                <li key={p.month} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-[11px] uppercase tracking-[0.12em] text-white/50">{monthLabel(p.month)}</span>
                  <span className="relative h-6 flex-1 overflow-hidden rounded bg-white/[0.04]">
                    <span
                      className="absolute inset-y-0 left-0 rounded bg-[var(--brand-accent)]/70"
                      style={{ width: `${Math.max(2, Math.round((p.gmvCents / maxMonth) * 100))}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-white/70">{money(p.gmvCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">Top organisers by GMV</h2>
          {topOrganisers.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No organiser sales yet.</p>
          ) : (
            <ol className="mt-4 space-y-2">
              {topOrganisers.map((o, i) => (
                <li key={o.organisationId} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.08] px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-white/40">{i + 1}</span>
                    <Link href={`/admin/organisers/${o.organisationId}`} className="truncate text-[var(--brand-accent)] hover:underline">{o.name}</Link>
                  </span>
                  <span className="shrink-0 text-white/70">{money(o.gmvCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
