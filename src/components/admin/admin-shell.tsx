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
 * Dark-default layout for ops use. Sidebar persistent on desktop, slide-over
 * on tablet/mobile. Topbar holds search, notifications, profile menu.
 *
 * Style tokens:
 *   --admin-bg       #0A0F1A (page)
 *   --admin-surface  #131A2A (cards)
 *   --admin-border   rgba(255,255,255,0.08)
 *
 * These are inlined as Tailwind arbitrary values to avoid a separate CSS
 * variable file in this phase. A1 closure can promote to globals.css.
 */
export function AdminShell({ session, children, breadcrumbs }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-[#0A0F1A] text-white">
      <div className="flex min-h-screen">
        <AdminSidebar role={session.admin.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar session={session} />
          <main className="flex-1 px-6 py-8 lg:px-10">
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex flex-wrap items-center gap-2 text-sm text-white/50">
                  {breadcrumbs.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex items-center gap-2">
                      {b.href ? (
                        <a className="hover:text-white" href={b.href}>{b.label}</a>
                      ) : (
                        <span className="text-white/80">{b.label}</span>
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
