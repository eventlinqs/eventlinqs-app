import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  listEvents,
  actionsForEventStatus,
  EVENT_ACTION_LABELS,
  EVENT_STATUS_FILTERS,
  type AdminEventRow,
  type EventAction,
} from '@/lib/admin/events'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { eventActionForm } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Events | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{
  status?: string
  q?: string
  page?: string
  notice?: string
  action?: string
}>

// Pause and cancel take an event off sale; confirm before applying.
const DESTRUCTIVE: ReadonlySet<EventAction> = new Set(['pause', 'cancel'])

const STATUS_BADGE: Record<string, string> = {
  draft: 'border-white/15 bg-white/[0.04] text-white/50',
  scheduled: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]',
  published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  postponed: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-200',
  completed: 'border-white/15 bg-white/[0.04] text-white/50',
}

/**
 * Event moderation - pause / resume / cancel (scope 3.7).
 *
 * Lists events with status + search filtering and paging. Each row exposes the
 * moderation actions valid from its current status. Every action is
 * audit-logged and gated behind admin.events.manage. The feature toggle is not
 * here - it waits on the is_featured migration.
 */
export default async function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.events.manage')) redirect('/admin')

  const sp = await searchParams
  const statusFilter = (EVENT_STATUS_FILTERS as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as (typeof EVENT_STATUS_FILTERS)[number])
    : 'all'
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1

  await recordAuditEvent({
    action: 'admin.events.view',
    session,
    metadata: { statusFilter, search: search ?? null, page },
  })

  const result = await listEvents({ status: statusFilter, search, page })
  const returnTo = buildReturnTo(statusFilter, search, page)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Trust and safety</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Events</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Pause a live event to take it off sale, resume a paused event, or cancel an event. Every
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
            placeholder="Title or slug"
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
            {EVENT_STATUS_FILTERS.map((s) => (
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
            href="/admin/events"
            className="rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Starts</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/50">No events match.</td>
              </tr>
            ) : (
              result.rows.map((row) => <EventRow key={row.id} row={row} returnTo={returnTo} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager statusFilter={statusFilter} search={search} page={result.page} hasMore={result.hasMore} />
    </div>
  )
}

function EventRow({ row, returnTo }: { row: AdminEventRow; returnTo: string }) {
  const actions = actionsForEventStatus(row.status)
  return (
    <tr className="border-t border-white/[0.06] align-top">
      <td className="px-4 py-3">
        <Link href={`/admin/events/${row.id}`} className="font-medium text-white hover:underline">{row.title}</Link>
        <div className="text-[11px] text-white/40">{row.slug}</div>
      </td>
      <td className="px-4 py-3 text-white/70">{row.organisationName ?? '-'}</td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${STATUS_BADGE[row.status] ?? STATUS_BADGE.draft}`}>
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-white/60">{row.startDate.slice(0, 10)}</td>
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

function ActionForm({ row, action, returnTo }: { row: AdminEventRow; action: EventAction; returnTo: string }) {
  const destructive = DESTRUCTIVE.has(action)
  const label = EVENT_ACTION_LABELS[action]
  const btnClass = action === 'cancel'
    ? 'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20'
    : action === 'pause'
      ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20'
      : 'rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#0A0F1A] transition hover:bg-white'
  return (
    <form action={eventActionForm} className="flex items-center gap-2">
      <input type="hidden" name="eventId" value={row.id} />
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
            confirmMessage={
              action === 'cancel'
                ? `Cancel "${row.title}"? This cannot be undone and is recorded in the audit log.`
                : `Pause "${row.title}"? It will be taken off sale. Recorded in the audit log.`
            }
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
    const verb: Record<string, string> = { pause: 'paused', resume: 'resumed', cancel: 'cancelled' }
    return (
      <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        Event {verb[action ?? ''] ?? 'updated'}.
      </div>
    )
  }
  if (notice === 'stale') {
    return (
      <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        That event changed since the page loaded. The current state is shown below.
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
  return qs ? `/admin/events?${qs}` : '/admin/events'
}
