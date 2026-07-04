import Link from 'next/link'
import type { AdminSession } from '@/lib/admin/types'
import { ROLE_LABELS } from '@/lib/admin/rbac'
import { filterNav } from './admin-nav'
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
    <header className="flex items-center gap-4 border-b border-white/[0.08] bg-[#0A0F1A] px-6 py-4 lg:px-10">
      <AdminMobileNav items={filterNav(session.capabilities)} />
      <form method="GET" action="/admin/search" className="hidden flex-1 sm:block">
        <label className="block">
          <span className="sr-only">Search organisers, events, users</span>
          <input
            type="search"
            name="q"
            placeholder="Search organisers, events, users"
            className="w-full max-w-xl rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </label>
      </form>
      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/admin/notifications"
          aria-label="Notifications and operations inbox"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <div className="text-right">
            <p className="text-sm font-medium leading-tight text-white">
              {session.admin.display_name}
            </p>
            <p className="text-[11px] uppercase tracking-wider leading-tight text-white/50">
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
