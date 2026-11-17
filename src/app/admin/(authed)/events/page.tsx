import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  countEventsByStatus,
  listEvents,
  EVENT_STATUS_FILTERS,
  type AdminEventRow,
} from '@/lib/admin/events'
import {
  ADMIN_CELL,
  ADMIN_CELL_ACTIONS,
  ADMIN_CELL_LABEL,
  ADMIN_CELL_NAME,
  ADMIN_EMPTY_CELL,
  ADMIN_EMPTY_ROW,
  ADMIN_ROW,
  ADMIN_TABLE,
  ADMIN_TABLE_WRAP,
  ADMIN_TBODY,
  ADMIN_THEAD,
} from '@/components/admin/table-card'
import { PageHeader, PRIMARY, SECONDARY, StatCard, StatusChip, type ChipTone } from '@/components/admin/ui/admin-kit'
import { dayTime } from '@/lib/dates/admin-dates'

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

// Pause, cancel and archive take an event off sale; confirm before applying.

/** Each status as the kit's coloured chip (the PM's 02:45 fix 2: grey capitalised ARCHIVED chips read as the old look). */
const STATUS_CHIP: Record<string, { tone: ChipTone; word: string }> = {
  draft: { tone: 'info', word: 'Draft' },
  scheduled: { tone: 'info', word: 'Scheduled' },
  published: { tone: 'ok', word: 'Live' },
  paused: { tone: 'waits', word: 'Paused' },
  postponed: { tone: 'waits', word: 'Postponed' },
  cancelled: { tone: 'fault', word: 'Cancelled' },
  completed: { tone: 'off', word: 'Ended' },
  archived: { tone: 'off', word: 'Archived' },
}
const QUIET = 'inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-4 text-sm font-medium text-white/85 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'

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

  const [result, counts] = await Promise.all([listEvents({ status: statusFilter, search, page }), countEventsByStatus()])
  const shown = (n: number | null) => (n === null ? 'Not read' : new Intl.NumberFormat('en-AU').format(n))

  return (
    <div>
      <PageHeader
        eyebrow="Events"
        title="Events"
        description="Open an event with Manage to pause it, resume it, cancel it, archive it off every public surface, restore it or delete it. Every action is recorded in the audit log."
      />

      {/* The counts first, as Humanitix's console leads with its numbers (the PM's 02:45 fix 2). */}
      <section data-section="event-counts" aria-label="Events by status" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Live" value={shown(counts.published)} />
        <StatCard label="Draft" value={shown(counts.draft)} />
        <StatCard label="Paused" value={shown(counts.paused)} />
        <StatCard label="Archived" value={shown(counts.archived)} />
      </section>

      <NoticeBanner notice={sp.notice} action={sp.action} />

      <form method="GET" className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-white/60">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Title or slug"
            defaultValue={search ?? ''}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-white/60">Status</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          >
            {EVENT_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : (STATUS_CHIP[s]?.word ?? s)}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={PRIMARY}>
            Apply
          </button>
          <Link prefetch={false} href="/admin/events" className={SECONDARY}>
            Reset
          </Link>
        </div>
      </form>

      {/* Below lg this stops being a table and each event becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[820px]`}>
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Starts</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {result.rows.length === 0 ? (
              <tr className={ADMIN_EMPTY_ROW}>
                <td colSpan={5} className={ADMIN_EMPTY_CELL}>No events match.</td>
              </tr>
            ) : (
              result.rows.map((row) => <EventRow key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager statusFilter={statusFilter} search={search} page={result.page} hasMore={result.hasMore} />
    </div>
  )
}

function EventRow({ row }: { row: AdminEventRow }) {
  return (
    <tr className={`${ADMIN_ROW} align-top`}>
      <td className={ADMIN_CELL_NAME}>
        {/* The name's line sits at the row's top with its organiser, status and date (the PM's 05:37 fix 3): the link keeps
            its 44 px target, its words at the top of it. */}
        <Link prefetch={false} href={`/admin/events/${row.id}`} className="inline-flex min-h-11 items-start font-medium text-white hover:underline">{row.title}</Link>
        <div className="text-[11px] text-white/40">{row.slug}</div>
      </td>
      <td className={`${ADMIN_CELL} text-white/70`}>
        <span className={ADMIN_CELL_LABEL}>Organiser</span>
        {row.organisationName ?? '-'}
      </td>
      <td className={ADMIN_CELL}>
        <span className={ADMIN_CELL_LABEL}>Status</span>
        <StatusChip tone={STATUS_CHIP[row.status]?.tone ?? 'info'}>{STATUS_CHIP[row.status]?.word ?? row.status}</StatusChip>
      </td>
      <td className={`${ADMIN_CELL} whitespace-nowrap text-white/60`}>
        <span className={ADMIN_CELL_LABEL}>Starts</span>
        {dayTime(row.startDate)}
      </td>
      {/* One quiet Manage per row, as the leaders' consoles have it (the PM's 02:45 fix 2; seen at 06:29 when live nights
          led with three reason boxes and a red Cancel each): every action lives on the event's own page, with its reason
          and its confirmation. */}
      <td className={ADMIN_CELL_ACTIONS}>
        <Link prefetch={false} href={`/admin/events/${row.id}`} className={QUIET} aria-label={`Manage ${row.title}`}>Manage</Link>
      </td>
    </tr>
  )
}

function NoticeBanner({ notice, action }: { notice?: string; action?: string }) {
  if (!notice) return null
  if (notice === 'done') {
    const verb: Record<string, string> = {
      pause: 'paused',
      resume: 'resumed',
      cancel: 'cancelled',
      archive: 'archived',
      restore: 'restored',
      delete: 'deleted. Nothing of it remains',
    }
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
      <span className="text-xs text-white/50">Page {page}</span>
      <div className="flex gap-2">
        {prev ? (
          <Link prefetch={false} href={prev} className={QUIET}>
            Newer
          </Link>
        ) : null}
        {next ? (
          <Link prefetch={false} href={next} className={QUIET}>
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
