import Link from 'next/link'
import { filterNavGroups } from './admin-nav'
import { AdminNavGroups } from './admin-nav-groups'

/**
 * Persistent admin sidebar (desktop). Sections shown only if the active role
 * carries the matching capability. Every item resolves to a live route. The
 * mobile drawer renders the same groups (admin-nav.ts) so the two never drift.
 * Grouped by workflow (Lawal, 15 November 2026, 20:52, item 2).
 */
export function AdminSidebar({ capabilities }: { capabilities: readonly string[] }) {
  const groups = filterNavGroups(capabilities)

  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--admin-line)] bg-[var(--admin-canvas)] lg:block">
      <div className="px-6 py-7">
        <Link prefetch={false} href="/admin/today" className="block">
          <span className="block font-display text-lg font-extrabold tracking-tight">
            EVENTLINQS<span className="text-[var(--brand-accent-strong)]">.</span>
          </span>
          <span className="block text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">
            Admin console
          </span>
        </Link>
      </div>
      <nav className="px-3 pb-10" aria-label="Admin sections">
        <AdminNavGroups groups={groups} />
      </nav>
    </aside>
  )
}
