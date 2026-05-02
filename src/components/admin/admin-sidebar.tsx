import Link from 'next/link'
import type { AdminRole } from '@/lib/admin/types'
import { hasCapability, type AdminCapability } from '@/lib/admin/rbac'

interface NavItem {
  label: string
  href: string
  capability: AdminCapability
  comingSoon?: boolean
}

const NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/admin',            capability: 'admin.dashboard.view' },
  { label: 'Organisers', href: '/admin/organisers', capability: 'admin.dashboard.view', comingSoon: true },
  { label: 'Events',     href: '/admin/events',     capability: 'admin.dashboard.view', comingSoon: true },
  { label: 'Financials', href: '/admin/financials', capability: 'admin.dashboard.view', comingSoon: true },
  { label: 'Support',    href: '/admin/support',    capability: 'admin.dashboard.view', comingSoon: true },
  { label: 'Audit',      href: '/admin/audit',      capability: 'admin.audit.read' },
  { label: 'Settings',   href: '/admin/settings',   capability: 'admin.profile.read', comingSoon: true },
]

/**
 * Persistent admin sidebar. Sections shown only if the active role
 * carries the matching capability. "Coming soon" items render disabled
 * so the founder can see what is queued without dead links.
 */
export function AdminSidebar({ role }: { role: AdminRole }) {
  const items = NAV.filter(i => hasCapability(role, i.capability))

  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/[0.08] bg-[#0A0F1A] lg:block">
      <div className="px-6 py-7">
        <Link href="/admin" className="block">
          <span className="block font-display text-lg font-extrabold tracking-tight">
            EVENTLINQS
          </span>
          <span className="block text-[11px] uppercase tracking-[0.2em] text-white/50">
            Admin console
          </span>
        </Link>
      </div>
      <nav className="px-3" aria-label="Admin sections">
        <ul className="flex flex-col gap-1">
          {items.map(i => (
            <li key={i.href}>
              {i.comingSoon ? (
                <span
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40"
                  aria-disabled="true"
                >
                  {i.label}
                  <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                    Soon
                  </span>
                </span>
              ) : (
                <Link
                  href={i.href}
                  className="block rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {i.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
