import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getOrgPayoutDetail, PAYOUT_CURRENCY } from '@/lib/admin/payouts'
import { DisbursePanel, VoidPayoutButton } from './payout-actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Organiser payouts | EventLinqs Admin',
  robots: { index: false, follow: false },
}

function money(cents: number, currency = PAYOUT_CURRENCY): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}
function date(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

const PAYOUT_BADGE: Record<string, string> = {
  paid: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  pending: 'border-white/15 bg-white/[0.04] text-white/60',
  in_transit: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]',
  failed: 'border-red-500/30 bg-red-500/10 text-red-200',
  canceled: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
}

export default async function AdminOrgPayoutPage({ params }: { params: Promise<{ orgId: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.payouts.disburse')) redirect('/admin')

  const { orgId } = await params
  const detail = await getOrgPayoutDetail(orgId)
  if (!detail) notFound()

  await recordAuditEvent({
    action: 'admin.payouts.org.view',
    targetType: 'organisation',
    targetId: orgId,
    session,
    metadata: { name: detail.name },
  })

  const activeHolds = detail.holds.filter(h => !h.releasedAt)
  const releasedHolds = detail.holds.filter(h => h.releasedAt)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Finance / Payouts</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{detail.name}</h1>
        <p className="mt-2 text-sm text-white/60">
          Payout status: {detail.payoutStatus} | Connected account: {detail.stripeAccountConnected ? 'yes' : 'no'}
        </p>
        <Link href="/admin/payouts" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-white/50 hover:text-white">
          Back to payouts
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Available</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{money(detail.availableCents)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">On reserve hold</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{money(detail.onHoldCents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <DisbursePanel
            organisationId={detail.id}
            availableCents={detail.availableCents}
            currency={PAYOUT_CURRENCY}
            payoutStatus={detail.payoutStatus}
            stripeConnected={detail.stripeAccountConnected}
          />

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h2 className="font-display text-lg font-semibold text-white">Reserve holds</h2>
            {activeHolds.length === 0 ? (
              <p className="mt-2 text-sm text-white/60">No active reserve holds.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {activeHolds.map(h => (
                  <li key={h.id} className="flex items-center justify-between rounded-md border border-white/[0.08] px-3 py-2 text-sm">
                    <span className="text-white/80">{money(h.amountCents, h.currency)}</span>
                    <span className="text-white/50">releases {date(h.releaseAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {releasedHolds.length > 0 ? (
              <p className="mt-3 text-xs text-white/40">{releasedHolds.length} released hold(s) not shown.</p>
            ) : null}
          </section>
        </div>

        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">Payout history</h2>
          {detail.payouts.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">No payouts yet for this organiser.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {detail.payouts.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-white/[0.08] px-3 py-2.5 text-sm">
                  <div>
                    <span className="text-white/80">{money(p.amountCents, p.currency)}</span>
                    <span className="ml-2 text-white/40">{date(p.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${PAYOUT_BADGE[p.status] ?? PAYOUT_BADGE.pending}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                    {(p.status === 'failed' || p.status === 'canceled') && !p.reversedAt ? (
                      <VoidPayoutButton payoutId={p.id} status={p.status as 'failed' | 'canceled'} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
