import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getUserDetail } from '@/lib/admin/users'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { RoleControl, SuspendControl } from './user-controls'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'User | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' }) : 'never'
}

const ROLE_BADGE: Record<string, string> = {
  attendee: 'border-white/15 bg-white/[0.04] text-white/60',
  organiser: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]',
  admin: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  super_admin: 'border-red-500/30 bg-red-500/10 text-red-200',
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.users.manage')) redirect('/admin')

  const { id } = await params
  const user = await getUserDetail(id)
  if (!user) notFound()

  await recordAuditEvent({
    action: 'admin.user.view',
    targetType: 'profile',
    targetId: id,
    session,
    metadata: { email: user.email },
  })

  const name = user.fullName || user.displayName || 'No name set'

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Accounts</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{name}</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${ROLE_BADGE[user.role] ?? ROLE_BADGE.attendee}`}>
            {user.role}
          </span>
          {user.suspended ? (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] text-red-200">Suspended</span>
          ) : (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] text-emerald-200">Active</span>
          )}
        </div>
        <p className="mt-2 text-sm text-white/60">{user.email}</p>
        <Link href="/admin/users" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-white/50 hover:text-white">Back to users</Link>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile label="Orders placed" value={user.ordersCount} />
        <AdminStatTile label="Events created" value={user.eventsCreatedCount} />
        <AdminStatTile label="Email verified" value={user.emailConfirmedAt ? 'Yes' : 'No'} status={user.emailConfirmedAt ? 'ok' : 'warn'} />
        <AdminStatTile label="Last sign in" value={date(user.lastSignInAt)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">Identity</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Full name" value={user.fullName ?? '-'} />
            <Row label="Display name" value={user.displayName ?? '-'} />
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={user.phone ?? '-'} />
            <Row label="Profile verified" value={user.isVerified ? 'Yes' : 'No'} />
            <Row label="Onboarding complete" value={user.onboardingCompleted ? 'Yes' : 'No'} />
            <Row label="Joined" value={date(user.createdAt)} />
            {user.suspended ? <Row label="Suspended until" value={date(user.bannedUntil)} /> : null}
          </dl>
        </section>

        <div className="space-y-6">
          <RoleControl userId={user.id} currentRole={user.role} />
          <SuspendControl userId={user.id} suspended={user.suspended} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-2 last:border-0">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right text-white/80">{value}</dd>
    </div>
  )
}
