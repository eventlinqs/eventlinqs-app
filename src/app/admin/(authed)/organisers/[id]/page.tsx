import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getOrganiserDetail } from '@/lib/admin/organisers'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { OrganiserControls } from './organiser-controls'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Organiser | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}
function date(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

const STATUS_BADGE: Record<string, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-200',
  deactivated: 'border-white/15 bg-white/[0.04] text-white/60',
}

function YesNo({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 text-sm last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={ok ? 'text-emerald-300' : 'text-amber-300'}>{ok ? 'Yes' : 'No'}</span>
    </div>
  )
}

export default async function AdminOrganiserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.users.manage')) redirect('/admin')

  const { id } = await params
  const org = await getOrganiserDetail(id)
  if (!org) notFound()

  await recordAuditEvent({
    action: 'admin.organiser.view',
    targetType: 'organisation',
    targetId: id,
    session,
    metadata: { name: org.name },
  })

  const v = org.verification

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Organisers</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{org.name}</h1>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${STATUS_BADGE[org.status] ?? STATUS_BADGE.deactivated}`}>
            {org.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/60">{org.email ?? 'No contact email'} | joined {date(org.createdAt)}</p>
        <Link href="/admin/organisers" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-white/50 hover:text-white">Back to organisers</Link>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminStatTile label="Events" value={org.totalEventCount} />
        <AdminStatTile label="Lifetime volume" value={money(org.totalVolumeCents)} />
        <AdminStatTile label="Payout status" value={org.payoutStatus} status={org.payoutStatus === 'active' ? 'ok' : 'warn'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">Verification (Stripe Connect)</h2>
          <p className="mt-1 text-xs text-white/40">Identity verification is handled by Stripe for the connected account.</p>

          {!v.hasAccount ? (
            <p className="mt-4 text-sm text-white/60">
              {v.lookupError
                ? 'Could not reach Stripe to read verification status. Try again shortly.'
                : 'This organiser has not connected a Stripe account yet, so onboarding and verification have not started.'}
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 text-sm">
                <span className="text-white/50">Onboarding</span>
                <span className={v.onboarded ? 'text-emerald-300' : 'text-amber-300'}>{v.onboarded ? 'Complete' : 'Incomplete'}</span>
              </div>
              <YesNo ok={v.chargesEnabled} label="Charges enabled" />
              <YesNo ok={v.payoutsEnabled} label="Payouts enabled" />
              <YesNo ok={v.detailsSubmitted} label="Details submitted" />
              {v.disabledReason ? (
                <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  Disabled reason: {v.disabledReason}
                </div>
              ) : null}
              {v.requirementsDue.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Requirements due</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {v.requirementsDue.map(r => (
                      <li key={r} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">{r}</li>
                    ))}
                  </ul>
                </div>
              ) : v.onboarded ? (
                <p className="mt-3 text-sm text-emerald-300">No outstanding requirements.</p>
              ) : null}
            </div>
          )}
        </section>

        <OrganiserControls organisationId={org.id} availableActions={org.availableActions} />
      </div>
    </div>
  )
}
