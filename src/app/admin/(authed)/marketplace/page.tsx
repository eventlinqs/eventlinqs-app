import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listMarketplaceReports } from '@/lib/admin/marketplace'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { removeGigAction, setReportStatusAction } from './actions'
import {
  ADMIN_CELL,
  ADMIN_CELL_ACTIONS,
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
  title: 'Marketplace moderation | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; filter?: string }>

/**
 * Performer marketplace moderation: the report queue over gigs,
 * applications, and performer profiles. A reported gig can be removed from
 * the board here (audit-logged); the row survives as history.
 */
export default async function AdminMarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.marketplace.manage')) {
    redirect('/admin')
  }
  await recordAuditEvent({ action: 'admin.marketplace.view', session })

  const { status, filter } = await searchParams
  const reports = await listMarketplaceReports(filter)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Trust and safety</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Marketplace reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Reports on gigs, applications, and performer profiles. Actioning a gig report can
          remove the gig from the board; every decision is audit-logged.
        </p>
      </header>

      {status === 'saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </div>
      )}
      {status === 'invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          That action was not valid. Refresh and try again.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {['', 'open', 'reviewed', 'dismissed', 'actioned'].map((f) => (
          <a
            key={f || 'all'}
            href={f ? `/admin/marketplace?filter=${f}` : '/admin/marketplace'}
            className={`rounded-full border px-3 py-1.5 ${
              (filter ?? '') === f
                ? 'border-amber-300/50 bg-amber-500/10 text-amber-800'
                : 'border-[var(--admin-line)] bg-[var(--admin-tint)] text-[var(--admin-soft)] hover:text-[var(--admin-ink)]'
            }`}
          >
            {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
          </a>
        ))}
      </div>

      {/* Below lg this stops being a table and each report becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[760px]`}>
          <thead className={ADMIN_THEAD}>
            <tr className="border-b border-[var(--admin-line)] text-left text-[var(--admin-muted)]">
              <th scope="col" className="px-4 py-3 font-medium">Target</th>
              <th scope="col" className="px-4 py-3 font-medium">Reason</th>
              <th scope="col" className="px-4 py-3 font-medium">Reporter</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {reports.length === 0 ? (
              <tr className={ADMIN_EMPTY_ROW}>
                <td colSpan={5} className={ADMIN_EMPTY_CELL}>
                  No reports{filter ? ` with status ${filter}` : ''}. A quiet queue is a healthy board.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className={`${ADMIN_ROW} align-top`}>
                  <td className={ADMIN_CELL_NAME}>
                    <div className="font-medium text-[var(--admin-ink)]">
                      {report.target_label ?? report.target_id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--admin-muted)]">
                      {report.target_type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className={`${ADMIN_CELL} max-w-xs text-[var(--admin-soft)]`}>
                    <span className={ADMIN_CELL_LABEL}>Reason</span>
                    <span className="font-medium text-[var(--admin-ink)]">{report.reason}</span>
                    {report.note ? <span className="block text-xs">{report.note}</span> : null}
                  </td>
                  <td className={`${ADMIN_CELL} text-[var(--admin-soft)]`}>
                    <span className={ADMIN_CELL_LABEL}>Reporter</span>
                    {report.reporter_email ?? 'unknown'}
                  </td>
                  <td className={ADMIN_CELL}>
                    <span className={ADMIN_CELL_LABEL}>Status</span>
                    <span
                      className={
                        report.status === 'open'
                          ? 'inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800'
                          : 'inline-flex items-center rounded-full border border-[var(--admin-line)] bg-[var(--admin-tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--admin-muted)]'
                      }
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className={ADMIN_CELL_ACTIONS}>
                    {report.status === 'open' ? (
                      <div className="flex flex-wrap gap-2">
                        {report.target_type === 'gig' && (
                          <form action={removeGigAction}>
                            <input type="hidden" name="gigId" value={report.target_id} />
                            <input type="hidden" name="reason" value={`report ${report.id}: ${report.reason}`} />
                            <ConfirmSubmitButton
                              confirmMessage="Remove this gig from the board? The listing closes for everyone."
                              className={`${ADMIN_ROW_CONTROL} justify-center rounded-md border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-800 transition hover:border-red-300/50`}
                            >
                              Remove gig
                            </ConfirmSubmitButton>
                          </form>
                        )}
                        <form action={setReportStatusAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="actioned" />
                          <button className={`${ADMIN_ROW_CONTROL} justify-center rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint-strong)] px-3 py-1.5 text-xs font-medium text-[var(--admin-ink)] transition hover:border-amber-300/40`}>
                            Mark actioned
                          </button>
                        </form>
                        <form action={setReportStatusAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button className={`${ADMIN_ROW_CONTROL} justify-center rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint-strong)] px-3 py-1.5 text-xs font-medium text-[var(--admin-soft)] transition hover:border-[var(--admin-line-strong)]`}>
                            Dismiss
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--admin-muted)]">Closed</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
