import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getDispute } from '@/lib/admin/disputes'
import { formatMoneyDisplay } from '@/lib/money/format'
import { DisputeRespondForm } from './respond-form'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Dispute | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const STATUS_BADGE: Record<string, string> = {
  needs_response: 'border-amber-500/30 bg-amber-500/10 text-amber-800',
  warning_needs_response: 'border-amber-500/30 bg-amber-500/10 text-amber-800',
  under_review: 'border-sky-500/30 bg-sky-500/10 text-sky-800',
  warning_under_review: 'border-sky-500/30 bg-sky-500/10 text-sky-800',
  won: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  prevented: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  warning_closed: 'border-[var(--admin-line)] bg-[var(--admin-tint)] text-[var(--admin-soft)]',
  lost: 'border-red-500/30 bg-red-500/10 text-red-800',
}

function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? 'border-[var(--admin-line)] bg-[var(--admin-tint)] text-[var(--admin-soft)]'
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit', timeZone: PLATFORM_TIME_ZONE }).format(new Date(iso))
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--admin-line)] py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">{label}</span>
      <span className="text-sm text-[var(--admin-ink)]">{children}</span>
    </div>
  )
}

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.disputes.manage')) redirect('/admin')

  const { id } = await params
  const result = await getDispute(id)

  await recordAuditEvent({
    action: 'admin.dispute.view',
    targetType: 'stripe_dispute',
    targetId: id,
    session,
    metadata: { found: result.ok },
  })

  if (!result.ok) {
    return (
      <div>
        <header className="mb-8">
          <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Disputes</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Dispute</h1>
          <Link prefetch={false} href="/admin/disputes" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] hover:text-[var(--admin-ink)]">
            Back to disputes
          </Link>
        </header>
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
          <p className="text-sm font-semibold text-red-800">Stripe is unreachable</p>
          <p className="mt-2 text-sm text-[var(--admin-soft)]">
            This dispute could not be loaded: {result.error}. Refresh to try again.
          </p>
        </div>
      </div>
    )
  }

  const dispute = result.dispute

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Disputes</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {formatMoneyDisplay(dispute.amountCents, dispute.currency)}
          </h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${statusBadgeClass(dispute.status)}`}
          >
            {dispute.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--admin-soft)]">
          {dispute.reason.replace(/_/g, ' ')} | raised {formatDate(dispute.createdAt)}
        </p>
        <Link prefetch={false} href="/admin/disputes" className="mt-3 inline-block text-xs uppercase tracking-[0.18em] text-[var(--admin-muted)] hover:text-[var(--admin-ink)]">
          Back to disputes
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <DisputeRespondForm
            disputeId={dispute.id}
            initial={{
              productDescription: dispute.evidence.productDescription,
              customerCommunication: dispute.evidence.customerCommunication,
              uncategorizedText: dispute.evidence.uncategorizedText,
            }}
            closedWords={
              dispute.isSubmittable
                ? null
                : `This dispute is in the ${dispute.status.replace(/_/g, ' ')} state, so no evidence can be submitted now. Stripe will update the status as the dispute is reviewed.`
            }
          />

          <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
            <h2 className="font-display text-lg font-semibold">Evidence on file</h2>
            {dispute.evidence.productDescription || dispute.evidence.customerCommunication || dispute.evidence.uncategorizedText ? (
              <dl className="mt-4 space-y-4 text-sm">
                {dispute.evidence.productDescription ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">Product description</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[var(--admin-ink)]">{dispute.evidence.productDescription}</dd>
                  </div>
                ) : null}
                {dispute.evidence.customerCommunication ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">Customer communication</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[var(--admin-ink)]">{dispute.evidence.customerCommunication}</dd>
                  </div>
                ) : null}
                {dispute.evidence.uncategorizedText ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">Additional notes</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[var(--admin-ink)]">{dispute.evidence.uncategorizedText}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-[var(--admin-soft)]">No evidence has been submitted on this dispute yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
          <h2 className="font-display text-lg font-semibold">Dispute details</h2>
          <div className="mt-4">
            <DetailRow label="Dispute id">
              <span className="font-mono text-xs text-[var(--admin-soft)]">{dispute.id}</span>
            </DetailRow>
            <DetailRow label="Amount">{formatMoneyDisplay(dispute.amountCents, dispute.currency)}</DetailRow>
            <DetailRow label="Reason">{dispute.reason.replace(/_/g, ' ')}</DetailRow>
            <DetailRow label="Status">{dispute.status.replace(/_/g, ' ')}</DetailRow>
            <DetailRow label="Evidence due">
              {dispute.evidenceDetails.dueBy ? (
                <span className={dispute.evidenceDetails.pastDue ? 'text-red-800' : 'text-[var(--admin-ink)]'}>
                  {formatDate(dispute.evidenceDetails.dueBy)}
                  {dispute.evidenceDetails.pastDue ? ' (past due)' : ''}
                </span>
              ) : (
                <span className="text-[var(--admin-muted)]">Not set</span>
              )}
            </DetailRow>
            <DetailRow label="Submissions">{dispute.evidenceDetails.submissionCount}</DetailRow>
            <DetailRow label="Charge">
              {dispute.chargeId ? (
                <span className="font-mono text-xs text-[var(--admin-soft)]">{dispute.chargeId}</span>
              ) : (
                <span className="text-[var(--admin-muted)]">-</span>
              )}
            </DetailRow>
            <DetailRow label="Related order">
              {dispute.relatedOrder ? (
                <Link prefetch={false}
                  href={`/admin/orders/${dispute.relatedOrder.id}`}
                  className="text-[var(--brand-accent-strong)] hover:underline"
                >
                  {dispute.relatedOrder.orderNumber}
                </Link>
              ) : (
                <span className="text-[var(--admin-muted)]">Not matched</span>
              )}
            </DetailRow>
          </div>
        </section>
      </div>
    </div>
  )
}
