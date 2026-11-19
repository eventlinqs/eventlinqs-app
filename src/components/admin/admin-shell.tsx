import type { ReactNode } from 'react'
import { AdminSidebar } from './admin-sidebar'
import { AdminTopbar } from './admin-topbar'
import type { AdminSession } from '@/lib/admin/types'

interface AdminShellProps {
  session: AdminSession
  children: ReactNode
  breadcrumbs?: { label: string; href?: string }[]
}

/**
 * Admin shell.
 *
 * A bright office back office (Lawal, 19 November 2026, 12:19: "as bright as an
 * office backend platform, like a real ticketing admin"): white cards on the
 * canvas, navy words, gold kept as the one accent. Sidebar persistent on
 * desktop, slide-over on tablet and mobile. Topbar holds search,
 * notifications, profile menu.
 *
 * Every admin colour is a role defined once under .admin-light in
 * globals.css (ink, soft, muted, line, line-strong, tint, tint-strong, paper,
 * canvas), each from an existing token, never a new colour.
 */
export function AdminShell({ session, children, breadcrumbs }: AdminShellProps) {
  return (
    <div className="admin-light min-h-screen bg-[var(--admin-canvas)] text-[var(--admin-ink)]">
      <div className="flex min-h-screen">
        <AdminSidebar capabilities={session.capabilities} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar session={session} />
          <main className="flex-1 px-6 py-8 lg:px-10">
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--admin-muted)]">
                  {breadcrumbs.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex items-center gap-2">
                      {b.href ? (
                        <a className="hover:text-[var(--admin-ink)]" href={b.href}>{b.label}</a>
                      ) : (
                        <span className="text-[var(--admin-ink)]">{b.label}</span>
                      )}
                      {i < breadcrumbs.length - 1 ? <span aria-hidden>/</span> : null}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
