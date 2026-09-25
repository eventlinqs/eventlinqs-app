import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  listProfiles,
  ASSIGNABLE_ROLES,
  USER_ROLE_FILTERS,
  isAssignableRole,
  type AdminUserListRow,
} from '@/lib/admin/users'
import { changeUserRoleForm } from './actions'
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
  title: 'Users | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{
  role?: string
  q?: string
  page?: string
  notice?: string
}>

const ROLE_BADGE: Record<string, string> = {
  attendee: 'border-white/15 bg-white/[0.04] text-white/60',
  organiser: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]',
  admin: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  super_admin: 'border-red-500/30 bg-red-500/10 text-red-200',
}

/**
 * User role management (scope 3.5).
 *
 * Lists profiles with role + search filtering. Each row can be set to one of
 * the assignable roles (attendee, organiser); platform admin / super_admin
 * cannot be granted here by design. Every change is audit-logged.
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.users.manage')) redirect('/admin')

  const sp = await searchParams
  const roleFilter = (USER_ROLE_FILTERS as readonly string[]).includes(sp.role ?? '')
    ? (sp.role as (typeof USER_ROLE_FILTERS)[number])
    : 'all'
  const search = sp.q?.trim() || undefined
  const page = sp.page ? Math.max(Number(sp.page) || 1, 1) : 1

  await recordAuditEvent({
    action: 'admin.users.view',
    session,
    metadata: { roleFilter, search: search ?? null, page },
  })

  const result = await listProfiles({ role: roleFilter, search, page })
  const returnTo = buildReturnTo(roleFilter, search, page)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Accounts</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Users</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Search accounts and change a user&apos;s role between attendee and organiser. Platform
          admin roles are not granted from here. Every change is recorded in the audit log.
        </p>
      </header>

      <NoticeBanner notice={sp.notice} />

      <form method="GET" className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Search</span>
          <input
            type="text"
            name="q"
            placeholder="Email or name"
            defaultValue={search ?? ''}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Role</span>
          <select
            name="role"
            defaultValue={roleFilter}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          >
            {USER_ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>{r === 'all' ? 'All roles' : r}</option>
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
            href="/admin/users"
            className="rounded-md border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Below lg this stops being a table and each user becomes a card
          carrying its own headings: src/components/admin/table-card.ts. */}
      <div className={`relative ${ADMIN_TABLE_WRAP}`}>
        <table className={`${ADMIN_TABLE} lg:min-w-[720px]`}>
          <thead className={ADMIN_THEAD}>
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Set role</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {result.rows.length === 0 ? (
              <tr className={ADMIN_EMPTY_ROW}>
                <td colSpan={5} className={ADMIN_EMPTY_CELL}>No users match.</td>
              </tr>
            ) : (
              result.rows.map((row) => <UserRow key={row.id} row={row} returnTo={returnTo} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager roleFilter={roleFilter} search={search} page={result.page} hasMore={result.hasMore} />
    </div>
  )
}

function UserRow({ row, returnTo }: { row: AdminUserListRow; returnTo: string }) {
  const defaultRole = isAssignableRole(row.role) ? row.role : ASSIGNABLE_ROLES[0]
  return (
    <tr className={`${ADMIN_ROW} align-middle`}>
      <td className={ADMIN_CELL_NAME}>
        <Link
          href={`/admin/users/${row.id}`}
          className={`${ADMIN_ROW_CONTROL} font-medium text-[var(--brand-accent)] hover:underline`}
        >
          {row.name ?? '(no name)'}
        </Link>
        <div className="text-[11px] text-white/40">{row.email}</div>
      </td>
      <td className={ADMIN_CELL}>
        <span className={ADMIN_CELL_LABEL}>Role</span>
        <span className={`inline-block rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${ROLE_BADGE[row.role] ?? ROLE_BADGE.attendee}`}>
          {row.role}
        </span>
      </td>
      <td className={`${ADMIN_CELL} text-white/70`}>
        <span className={ADMIN_CELL_LABEL}>Verified</span>
        {row.isVerified ? 'Yes' : 'No'}
      </td>
      <td className={`${ADMIN_CELL} whitespace-nowrap text-white/60`}>
        <span className={ADMIN_CELL_LABEL}>Joined</span>
        {row.createdAt.slice(0, 10)}
      </td>
      <td className={ADMIN_CELL_ACTIONS}>
        <form action={changeUserRoleForm} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={row.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="sr-only" htmlFor={`role-${row.id}`}>New role for {row.email}</label>
          <select
            id={`role-${row.id}`}
            name="newRole"
            defaultValue={defaultRole}
            className="min-h-11 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-sm text-white outline-none focus:border-white/40"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="submit"
            className={`${ADMIN_ROW_CONTROL} justify-center rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#0A0F1A] transition hover:bg-white`}
          >
            Save
          </button>
        </form>
      </td>
    </tr>
  )
}

function NoticeBanner({ notice }: { notice?: string }) {
  if (!notice) return null
  if (notice === 'done') {
    return (
      <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        Role updated.
      </div>
    )
  }
  if (notice === 'nochange') {
    return (
      <div role="status" className="mb-6 rounded-md border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
        That user already had the selected role. Nothing changed.
      </div>
    )
  }
  return (
    <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {notice === 'invalid' ? 'That request was not valid.' : 'Could not change the role. Try again.'}
    </div>
  )
}

function Pager({
  roleFilter,
  search,
  page,
  hasMore,
}: {
  roleFilter: string
  search?: string
  page: number
  hasMore: boolean
}) {
  const prev = page > 1 ? buildReturnTo(roleFilter, search, page - 1) : null
  const next = hasMore ? buildReturnTo(roleFilter, search, page + 1) : null
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

function buildReturnTo(roleFilter: string, search: string | undefined, page: number): string {
  const sp = new URLSearchParams()
  if (roleFilter && roleFilter !== 'all') sp.set('role', roleFilter)
  if (search) sp.set('q', search)
  if (page > 1) sp.set('page', String(page))
  const qs = sp.toString()
  return qs ? `/admin/users?${qs}` : '/admin/users'
}
