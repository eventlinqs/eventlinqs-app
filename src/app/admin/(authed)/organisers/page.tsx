import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { hasCapability } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  listOrganisations,
  actionsForStatus,
  ORGANISER_ACTION_LABELS,
  ORGANISER_STATUS_FILTERS,
  type AdminOrganiserRow,
  type OrganiserAction,
} from '@/lib/admin/organisers'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { organiserActionForm } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Organisers | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{
  status?: string
  q?: string
  page?: string
  notice?: string
  action?: string
}>

const DESTRUCTIVE: ReadonlySet<OrganiserAction> = new Set(['reject', 'suspend'])

const STATUS_BADGE: Record<string, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-200',
  deactivated: 'border-white/15 bg-white/[0.04] text-white/50',
}

/**
 * Organiser moderation (scope 3.4 / 3.6).
 *
 * Lists organisations with status, search, and paging. Each row exposes the
 * lifecycle actions valid from its current status. Every action is audit-logged
 * and gated behind admin.users.manage.
 */
export default async function AdminOrganisersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!hasCapability(session.admin.role, 'admin.users.manage')) redirect('/admin')

  const sp = await searchParams
  const statusFilter = (ORGANISER_STATUS_FILTERS as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as (typeof ORGANISER_STATUS_FILTERS)[number])
    : 'all'
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1

  await recordAuditEvent({
    action: 'admin.organisers.view',
    session,
    metadata: { statusFilter, search: search ?? null, page },
  })

  const result = await listOrganisations({ status: statusFilter, search, page })
  const returnTo = buildReturnTo(statusFilter, search, page)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Trust and safety</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Organisers</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Approve new organisers, reject applications, and suspend or reinstate accounts. Every
          action is recorded in the audit log.
        </p>
      </header>

      <NoticeBanner notice={sp.notice} action={sp.action} />

      <form method="GET" className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Name, slug, or email"
            defaultValue={search ?? ''}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Status</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          >
            {ORGANISER_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]"
          >
            Apply
          </button>
          <Link
            href="/admin/organisers"
            className="rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payouts</th>
              <th className="px-4 py-3 font-medium">Events</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/50">No organisers match.</td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <OrganiserRow key={row.id} row={row} returnTo={returnTo} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager statusFilter={statusFilter} search={search} page={result.page} hasMore={result.hasMore} />
    </div>
  )
}

function OrganiserRow({ row, returnTo }: { row: AdminOrganiserRow; returnTo: string }) {
  const actions = actionsForStatus(row.status)
  return (
    <tr className="border-t border-white/[0.06] align-top">
      <td className="px-4 py-3">
        <Link href={`/admin/organisers/${row.id}`} className="font-medium text-[var(--brand-accent)] hover:underline">{row.name}</Link>
        <div className="text-[11px] text-white/40">{row.slug}</div>
        {row.email ? <div className="text-[11px] text-white/40">{row.email}</div> : null}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${STATUS_BADGE[row.status] ?? STATUS_BADGE.deactivated}`}>
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3 text-white/70">
        {row.stripeChargesEnabled ? 'Charges on' : 'Charges off'}
        <div className="text-[11px] text-white/40">{row.payoutStatus}</div>
      </td>
      <td className="px-4 py-3 text-white/70">{row.totalEventCount}</td>
      <td className="px-4 py-3 whitespace-nowrap text-white/60">{row.createdAt.slice(0, 10)}</td>
      <td className="px-4 py-3">
        {actions.length === 0 ? (
          <span className="text-[11px] text-white/40">No actions</span>
        ) : (
          <div className="flex flex-col gap-2">
            {actions.map((action) => (
              <ActionForm key={action} row={row} action={action} returnTo={returnTo} />
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

function ActionForm({ row, action, returnTo }: { row: AdminOrganiserRow; action: OrganiserAction; returnTo: string }) {
  const destructive = DESTRUCTIVE.has(action)
  const label = ORGANISER_ACTION_LABELS[action]
  const btnClass = destructive
    ? 'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20'
    : 'rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#0A0F1A] transition hover:bg-white'
  return (
    <form action={organiserActionForm} className="flex items-center gap-2">
      <input type="hidden" name="organisationId" value={row.id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {destructive ? (
        <>
          <label className="sr-only" htmlFor={`reason-${action}-${row.id}`}>Reason for {label}</label>
          <input
            id={`reason-${action}-${row.id}`}
            name="reason"
            type="text"
            placeholder="Reason (optional)"
            maxLength={500}
            className="w-40 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-xs text-white outline-none focus:border-white/40"
          />
          <ConfirmSubmitButton
            confirmMessage={`${label} "${row.name}"? This is recorded in the audit log.`}
            className={btnClass}
          >
            {label}
          </ConfirmSubmitButton>
        </>
      ) : (
        <button type="submit" className={btnClass}>{label}</button>
      )}
    </form>
  )
}

function NoticeBanner({ notice, action }: { notice?: string; action?: string }) {
  if (!notice) return null
  if (notice === 'done') {
    const verb: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      suspend: 'suspended',
      reinstate: 'reinstated',
    }
    return (
      <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        Organiser {verb[action ?? ''] ?? 'updated'}.
      </div>
    )
  }
  if (notice === 'stale') {
    return (
      <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        That organiser changed since the page loaded. The current state is shown below.
      </div>
    )
  }
  return (
    <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {notice === 'invalid' ? 'That request was not valid.' : 'Could not apply that change. Try again.'}
    </div>
  )
}

function Pager({
  statusFilter,
  search,
  page,
  hasMore,
}: {
  statusFilter: string
  search?: string
  page: number
  hasMore: boolean
}) {
  const prev = page > 1 ? buildReturnTo(statusFilter, search, page - 1) : null
  const next = hasMore ? buildReturnTo(statusFilter, search, page + 1) : null
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-xs uppercase tracking-[0.18em] text-white/40">Page {page}</span>
      <div className="flex gap-2">
        {prev ? (
          <Link href={prev} className="rounded-md border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white">
            Newer
          </Link>
        ) : null}
        {next ? (
          <Link href={next} className="rounded-md border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white">
            Older
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function buildReturnTo(statusFilter: string, search: string | undefined, page: number): string {
  const sp = new URLSearchParams()
  if (statusFilter && statusFilter !== 'all') sp.set('status', statusFilter)
  if (search) sp.set('q', search)
  if (page > 1) sp.set('page', String(page))
  const qs = sp.toString()
  return qs ? `/admin/organisers?${qs}` : '/admin/organisers'
}
