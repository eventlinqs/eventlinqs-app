import { countOf } from '@/lib/text/plural'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getOrgPayoutDetail, PAYOUT_CURRENCY } from '@/lib/admin/payouts'
import { DisbursePanel, FasterPayoutPanel, VoidPayoutButton } from './payout-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayoutScheduleDays } from '@/lib/payments/pricing-rules'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

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
  return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium', timeZone: PLATFORM_TIME_ZONE })
}

const PAYOUT_BADGE: Record<string, string> = {
  paid: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  pending: 'border-[var(--admin-line)] bg-[var(--admin-tint)] text-[var(--admin-soft)]',
  in_transit: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent-strong)]',
  failed: 'border-red-500/30 bg-red-500/10 text-red-800',
  canceled: 'border-amber-500/30 bg-amber-500/10 text-amber-800',
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

  // Item 21: the database's own answer for faster payouts, read only for the one who may switch it (super_admin).
  const mayFaster = can(session, 'admin.payouts.faster')
  const faster = mayFaster
    ? ((await createAdminClient().rpc('faster_payout_check', { p_org: orgId })).data?.[0] ?? null)
    : null
  const platformBufferDays = mayFaster ? await getPayoutScheduleDays('AU', 'AUD').catch((err: unknown) => {
    console.warn('[admin/payouts] payout_schedule_days not read', err)
    return 3
  }) : 3

  const activeHolds = detail.holds.filter(h => !h.releasedAt)
  const releasedHolds = detail.holds.filter(h => h.releasedAt)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Finance / Payouts</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{detail.name}</h1>
        <p className="mt-2 text-sm text-[var(--admin-soft)]">
          Payout status: {detail.payoutStatus} | Connected account: {detail.stripeAccountConnected ? 'yes' : 'no'}
        </p>
        <Link prefetch={false} href="/admin/payouts" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] hover:text-[var(--admin-ink)]">
          Back to payouts
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">Available</p>
          <p className="mt-2 font-display text-3xl font-bold text-[var(--admin-ink)]">{money(detail.availableCents)}</p>
        </div>
        <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">On reserve hold</p>
          <p className="mt-2 font-display text-3xl font-bold text-[var(--admin-ink)]">{money(detail.onHoldCents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <DisbursePanel
            organisationId={detail.id}
            availableCents={detail.availableCents}
            currency={PAYOUT_CURRENCY}
            payoutStatus={detail.payoutStatus}
            stripeConnected={detail.stripeAccountConnected}
          />

          {mayFaster ? (
            <FasterPayoutPanel
              organisationId={detail.id}
              qualifies={faster?.qualifies ?? false}
              bufferDays={faster?.buffer_days ?? null}
              reason={faster?.reason ?? null}
              platformBufferDays={platformBufferDays}
            />
          ) : null}

          <section className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
            <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Reserve holds</h2>
            {activeHolds.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--admin-soft)]">No active reserve holds.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {activeHolds.map(h => (
                  <li key={h.id} className="flex items-center justify-between rounded-md border border-[var(--admin-line)] px-3 py-2 text-sm">
                    <span className="text-[var(--admin-ink)]">{money(h.amountCents, h.currency)}</span>
                    <span className="text-[var(--admin-muted)]">releases {date(h.releaseAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {releasedHolds.length > 0 ? (
              <p className="mt-3 text-xs text-[var(--admin-muted)]">{countOf(releasedHolds.length, 'released hold')} not shown.</p>
            ) : null}
          </section>
        </div>

        <section className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Payout history</h2>
          {detail.payouts.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--admin-soft)]">No payouts yet for this organiser.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {detail.payouts.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--admin-line)] px-3 py-2.5 text-sm">
                  <div>
                    <span className="text-[var(--admin-ink)]">{money(p.amountCents, p.currency)}</span>
                    <span className="ml-2 text-[var(--admin-muted)]">{date(p.createdAt)}</span>
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
