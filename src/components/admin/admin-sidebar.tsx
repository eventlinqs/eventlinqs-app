import Link from 'next/link'
import type { AdminCapability } from '@/lib/admin/rbac'

interface NavItem {
  label: string
  href: string
  capability: AdminCapability
}

const NAV: NavItem[] = [
  { label: 'Dashboard',        href: '/admin',            capability: 'admin.dashboard.view' },
  { label: 'Pricing and fees', href: '/admin/pricing',    capability: 'admin.pricing.manage' },
  { label: 'Organisers',       href: '/admin/organisers', capability: 'admin.users.manage' },
  { label: 'KYC review',       href: '/admin/kyc',        capability: 'admin.users.manage' },
  { label: 'Users',            href: '/admin/users',      capability: 'admin.users.manage' },
  { label: 'Events',           href: '/admin/events',     capability: 'admin.events.manage' },
  { label: 'Orders',           href: '/admin/orders',     capability: 'admin.refunds.process' },
  { label: 'Refunds',          href: '/admin/refunds',    capability: 'admin.refunds.process' },
  { label: 'Disputes',         href: '/admin/disputes',   capability: 'admin.refunds.process' },
  { label: 'Payouts',          href: '/admin/payouts',    capability: 'admin.payouts.disburse' },
  { label: 'Admin staff',      href: '/admin/staff',      capability: 'admin.invites.manage' },
  { label: 'Analytics (GMV)',  href: '/admin/analytics',  capability: 'admin.pricing.manage' },
  { label: 'Audit',            href: '/admin/audit',      capability: 'admin.audit.read' },
]

/**
 * Persistent admin sidebar. Sections shown only if the active role
 * carries the matching capability. Every item resolves to a live route.
 */
export function AdminSidebar({ capabilities }: { capabilities: readonly string[] }) {
  const items = NAV.filter(i => capabilities.includes(i.capability))

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
              <Link
                href={i.href}
                className="block rounded-md px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
