import Link from 'next/link'
import type { AdminSession } from '@/lib/admin/types'
import { ROLE_LABELS } from '@/lib/admin/rbac'
import { filterNav, filterNavGroups } from './admin-nav'
import { AdminMobileNav } from './admin-mobile-nav'

/**
 * Top bar for the admin shell: a working global search (submits to
 * /admin/search), a notifications link to the operations inbox, and the
 * profile pill showing display name + role. Solid navy chrome, no
 * glassmorphism (Chrome consistency law).
 *
 * Sign-out is a server action wired via the /admin/login form (re-used).
 */
export function AdminTopbar({ session }: { session: AdminSession }) {
  return (
    <header className="flex items-center gap-4 border-b border-[var(--admin-line)] bg-[var(--admin-canvas)] px-6 py-4 lg:px-10">
      <AdminMobileNav items={filterNav(session.capabilities)} groups={filterNavGroups(session.capabilities)} />
      <form method="GET" action="/admin/search" className="hidden flex-1 sm:block">
        <label className="block">
          <span className="sr-only">Search organisers, events, users</span>
          <input
            type="search"
            name="q"
            placeholder="Search organisers, events, users"
            className="w-full max-w-xl rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 py-2 text-sm text-[var(--admin-ink)] placeholder:text-[var(--admin-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
      </form>
      <div className="ml-auto flex items-center gap-3">
        <Link prefetch={false}
          href="/admin/notifications"
          aria-label="Notifications and operations inbox"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--admin-soft)] transition hover:bg-[var(--admin-tint-strong)] hover:text-[var(--admin-ink)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
        {/* One line at every width (the PM's 02:45 fix 6: 'Automation drive' wrapped at 320): the name truncates instead. */}
        <div className="flex min-w-0 items-center gap-3 rounded-full border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 py-1.5">
          <div className="min-w-0 text-right">
            <p className="max-w-[7.5rem] truncate whitespace-nowrap text-sm font-medium leading-tight text-[var(--admin-ink)] sm:max-w-[14rem]">
              {session.admin.display_name}
            </p>
            <p className="whitespace-nowrap text-[11px] uppercase tracking-wider leading-tight text-[var(--admin-muted)]">
              {ROLE_LABELS[session.admin.role]}
            </p>
          </div>
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brand-accent)] text-xs font-bold text-[var(--text-primary)]">
            {initialsOf(session.admin.display_name)}
          </span>
        </div>
      </div>
    </header>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || 'A'
}
