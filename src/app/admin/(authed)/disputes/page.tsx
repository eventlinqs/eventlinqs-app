import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listDisputes } from '@/lib/admin/disputes'
import { formatMoneyDisplay } from '@/lib/money/format'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Disputes | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const STATUS_BADGE: Record<string, string> = {
  needs_response: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  warning_needs_response: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  under_review: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  warning_under_review: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  won: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  prevented: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning_closed: 'border-white/15 bg-white/[0.04] text-white/60',
  lost: 'border-red-500/30 bg-red-500/10 text-red-200',
}

function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? 'border-white/15 bg-white/[0.04] text-white/60'
}

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}


export default async function AdminDisputesPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.disputes.manage')) redirect('/admin')

  await recordAuditEvent({
    action: 'admin.disputes.view',
    session,
  })

  const result = await listDisputes({ limit: 50 })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Disputes</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Chargebacks raised against the platform appear here. Respond with evidence before the due date,
          or accept the dispute to forfeit it. Every action is recorded in the audit log.
        </p>
      </header>

      {!result.ok ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
          <p className="text-sm font-semibold text-red-200">Stripe is unreachable</p>
          <p className="mt-2 text-sm text-white/60">
            Disputes could not be loaded: {result.error}. Refresh to try again.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Evidence due</th>
                  <th className="px-4 py-3 font-medium">Dispute</th>
                </tr>
              </thead>
              <tbody>
                {result.disputes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-white/50">
                      No open disputes. Chargebacks raised against the platform will appear here.
                    </td>
                  </tr>
                ) : (
                  result.disputes.map(d => {
                    const pastDue = d.dueStatus === 'past_due'
                    const dueSoon = d.dueStatus === 'due_soon'
                    const dueClass = pastDue ? 'text-red-200' : dueSoon ? 'text-amber-200' : 'text-white/70'
                    return (
                      <tr key={d.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                        <td className="px-4 py-3 text-white/70">{formatMoneyDisplay(d.amountCents, d.currency)}</td>
                        <td className="px-4 py-3 text-white/70">{d.reason.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.16em] ${statusBadgeClass(d.status)}`}
                          >
                            {d.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={`px-4 py-3 ${dueClass}`}>
                          {d.dueBy ? (
                            <>
                              {formatDueDate(d.dueBy)}
                              {pastDue ? <span className="ml-2 text-[11px] uppercase tracking-[0.16em]">past due</span> : null}
                              {dueSoon ? <span className="ml-2 text-[11px] uppercase tracking-[0.16em]">due soon</span> : null}
                            </>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/disputes/${d.id}`} className="text-[var(--brand-accent)] hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/50">
            {result.disputes.length} {result.disputes.length === 1 ? 'dispute' : 'disputes'}
          </p>
        </>
      )}
    </div>
  )
}
