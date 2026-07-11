import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { listMarketplaceReports } from '@/lib/admin/marketplace'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { removeGigAction, setReportStatusAction } from './actions'

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
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Trust and safety</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Marketplace reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Reports on gigs, applications, and performer profiles. Actioning a gig report can
          remove the gig from the board; every decision is audit-logged.
        </p>
      </header>

      {status === 'saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Saved.
        </div>
      )}
      {status === 'invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
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
                ? 'border-amber-300/50 bg-amber-500/10 text-amber-200'
                : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'
            }`}
          >
            {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Target</th>
              <th scope="col" className="px-4 py-3 font-medium">Reason</th>
              <th scope="col" className="px-4 py-3 font-medium">Reporter</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-white/50">
                  No reports{filter ? ` with status ${filter}` : ''}. A quiet queue is a healthy board.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="border-b border-white/[0.05] align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">
                      {report.target_label ?? report.target_id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-white/40">
                      {report.target_type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-white/60">
                    <span className="font-medium text-white/80">{report.reason}</span>
                    {report.note ? <span className="block text-xs">{report.note}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-white/60">{report.reporter_email ?? 'unknown'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        report.status === 'open'
                          ? 'inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-200'
                          : 'inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-white/50'
                      }
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {report.status === 'open' ? (
                      <div className="flex flex-wrap gap-2">
                        {report.target_type === 'gig' && (
                          <form action={removeGigAction}>
                            <input type="hidden" name="gigId" value={report.target_id} />
                            <input type="hidden" name="reason" value={`report ${report.id}: ${report.reason}`} />
                            <ConfirmSubmitButton
                              confirmMessage="Remove this gig from the board? The listing closes for everyone."
                              className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:border-red-300/50"
                            >
                              Remove gig
                            </ConfirmSubmitButton>
                          </form>
                        )}
                        <form action={setReportStatusAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="actioned" />
                          <button className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:border-amber-300/40">
                            Mark actioned
                          </button>
                        </form>
                        <form action={setReportStatusAction}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30">
                            Dismiss
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-white/40">Closed</span>
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
