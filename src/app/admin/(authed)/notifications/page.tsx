import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPendingRefunds } from '@/lib/admin/refunds'
import { countOpenDisputes } from '@/lib/admin/disputes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Notifications | EventLinqs Admin',
  robots: { index: false, follow: false },
}

async function kycCount(): Promise<number> {
  const db = createAdminClient()
  const { count, error } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .in('payout_status', ['on_hold', 'restricted'])
  if (error) throw error
  return count ?? 0
}

interface Alert {
  label: string
  count: number | null
  description: string
  href: string
}

function AlertCard({ label, count, description, href }: Alert) {
  const needsAttention = count != null && count > 0
  const unreachable = count == null
  return (
    <Link
      href={href}
      className="block rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</p>
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 rounded-full ${unreachable ? 'bg-rose-500' : needsAttention ? 'bg-amber-400' : 'bg-emerald-400'}`}
        />
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-white">{unreachable ? '-' : count}</p>
      <p className="mt-2 text-xs text-white/50">{unreachable ? 'unreachable, retry' : description}</p>
    </Link>
  )
}

export default async function AdminNotificationsPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')

  await recordAuditEvent({ action: 'admin.notifications.view', session })

  const [disputes, refunds, kyc] = await Promise.all([
    countOpenDisputes(),
    countPendingRefunds().catch(() => null),
    kycCount().catch(() => null),
  ])

  const alerts: Alert[] = [
    {
      label: 'Open disputes',
      count: disputes.ok ? disputes.count : null,
      description: 'chargebacks awaiting a response',
      href: '/admin/disputes',
    },
    {
      label: 'Pending refunds',
      count: refunds,
      description: 'pending, processing, or failed',
      href: '/admin/refunds',
    },
    {
      label: 'KYC review',
      count: kyc,
      description: 'organisers on hold or restricted',
      href: '/admin/kyc',
    },
  ]

  const totalOpen = alerts.reduce((s, a) => s + (a.count && a.count > 0 ? a.count : 0), 0)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations inbox</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          {totalOpen > 0
            ? 'Items that need an operator. Open a queue to action them.'
            : 'All clear. Nothing needs an operator right now. New alerts appear here as they arise.'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {alerts.map(a => (
          <AlertCard key={a.label} {...a} />
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
        <h2 className="font-display text-sm uppercase tracking-widest text-white/60">Activity</h2>
        <p className="mt-2 text-sm text-white/50">
          Every admin action is recorded. Review the full history in the{' '}
          <Link href="/admin/audit" className="text-[var(--brand-accent)] hover:underline">
            audit log
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
