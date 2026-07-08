import type { AdminCapability } from '@/lib/admin/rbac'

/**
 * Single source of truth for the admin navigation. Both the desktop sidebar
 * and the mobile drawer render from this list, filtered by the viewer's
 * effective capabilities, so the two can never drift.
 */
export interface AdminNavItem {
  label: string
  href: string
  capability: AdminCapability
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Dashboard',        href: '/admin',            capability: 'admin.dashboard.view' },
  { label: 'Pricing and fees', href: '/admin/pricing',    capability: 'admin.pricing.manage' },
  { label: 'Organisers',       href: '/admin/organisers', capability: 'admin.users.manage' },
  { label: 'KYC review',       href: '/admin/kyc',        capability: 'admin.users.manage' },
  { label: 'Users',            href: '/admin/users',      capability: 'admin.users.manage' },
  { label: 'Events',           href: '/admin/events',     capability: 'admin.events.manage' },
  { label: 'Orders',           href: '/admin/orders',     capability: 'admin.refunds.process' },
  { label: 'Refunds',          href: '/admin/refunds',    capability: 'admin.refunds.process' },
  { label: 'Disputes',         href: '/admin/disputes',   capability: 'admin.disputes.manage' },
  { label: 'Payouts',          href: '/admin/payouts',    capability: 'admin.payouts.disburse' },
  { label: 'Venue revenue',    href: '/admin/venues',     capability: 'admin.venues.manage' },
  { label: 'Feature flags',    href: '/admin/flags',      capability: 'admin.flags.manage' },
  { label: 'Admin staff',      href: '/admin/staff',      capability: 'admin.invites.manage' },
  { label: 'Analytics (GMV)',  href: '/admin/analytics',  capability: 'admin.pricing.manage' },
  { label: 'Audit',            href: '/admin/audit',      capability: 'admin.audit.read' },
]

export interface AdminNavLink {
  label: string
  href: string
}

/** The nav links the given capabilities may see, label + href only. */
export function filterNav(capabilities: readonly string[]): AdminNavLink[] {
  return ADMIN_NAV.filter(i => capabilities.includes(i.capability)).map(({ label, href }) => ({ label, href }))
}
