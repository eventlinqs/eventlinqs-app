import type { AdminCapability } from '@/lib/admin/rbac'

/**
 * Single source of truth for the admin navigation. Both the desktop sidebar
 * and the mobile drawer render from this list, filtered by the viewer's
 * effective capabilities, so the two can never drift.
 *
 * ONE NAVIGATION BY WORKFLOW (Lawal, 15 November 2026, 20:52, item 2: "a workflow-organized admin page"; the order is his:
 * Today, Events, Organisers, Outreach, Social, Automation, Money, Settings). Every admin page sits in exactly one group,
 * the way Humanitix's host console groups its menu (Events: all, live, draft, past, archived) and Shopify's admin keeps
 * one sidebar of sections (C:/dev/EVIDENCE/EL-15NOV/admin/leaders/leaders-admin.md).
 */
export interface AdminNavItem {
  label: string
  href: string
  capability: AdminCapability
}

export type AdminNavGroupKey = 'today' | 'events' | 'organisers' | 'outreach' | 'social' | 'automation' | 'money' | 'settings'

export interface AdminNavGroup {
  key: AdminNavGroupKey
  label: string
  items: AdminNavItem[]
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    key: 'today',
    label: 'Today',
    items: [
      { label: 'Today', href: '/admin/today', capability: 'admin.dashboard.view' },
      { label: 'Overview', href: '/admin', capability: 'admin.dashboard.view' },
      { label: 'Growth plan', href: '/admin/growth', capability: 'admin.pricing.manage' },
      { label: 'Communications centre', href: '/admin/comms', capability: 'admin.network.manage' },
      { label: 'Platform health', href: '/admin/health', capability: 'admin.dashboard.view' },
    ],
  },
  {
    key: 'events',
    label: 'Events',
    items: [
      { label: 'Events', href: '/admin/events', capability: 'admin.events.manage' },
      { label: 'Submitted events', href: '/admin/submissions', capability: 'admin.events.manage' },
      { label: 'Collected events', href: '/admin/collected', capability: 'admin.events.manage' },
      { label: 'Venue photographs', href: '/admin/venues/photos', capability: 'admin.venues.manage' },
    ],
  },
  {
    key: 'organisers',
    label: 'Organisers',
    items: [
      { label: 'Organisers', href: '/admin/organisers', capability: 'admin.users.manage' },
      { label: 'KYC review', href: '/admin/kyc', capability: 'admin.users.manage' },
      { label: 'Partners', href: '/admin/partners', capability: 'admin.network.manage' },
      { label: 'Users', href: '/admin/users', capability: 'admin.users.manage' },
    ],
  },
  {
    key: 'outreach',
    label: 'Outreach',
    items: [
      { label: 'Organiser pipeline', href: '/admin/acquisition', capability: 'admin.network.manage' },
      { label: 'Page checks', href: '/admin/page-checks', capability: 'admin.network.manage' },
      { label: 'Campaigns', href: '/admin/campaigns', capability: 'admin.network.manage' },
      { label: 'Campaign eligibility', href: '/admin/eligibility', capability: 'admin.network.manage' },
      { label: 'Matches', href: '/admin/matches', capability: 'admin.network.manage' },
      { label: 'Opportunity', href: '/admin/opportunity', capability: 'admin.network.manage' },
      { label: 'Demand signal', href: '/admin/network', capability: 'admin.network.manage' },
      { label: 'Audience', href: '/admin/audience', capability: 'admin.network.manage' },
    ],
  },
  {
    key: 'social',
    label: 'Social',
    items: [
      { label: 'Social posts', href: '/admin/social', capability: 'admin.network.manage' },
      { label: 'Weekly roundup', href: '/admin/roundup', capability: 'admin.network.manage' },
      { label: 'Free traffic', href: '/admin/traffic', capability: 'admin.network.manage' },
      { label: 'Attribution', href: '/admin/attribution', capability: 'admin.network.manage' },
    ],
  },
  {
    key: 'automation',
    label: 'Automation',
    items: [
      // Lawal's home screen as employee one (his 13:55 of 15 November 2026).
      { label: 'Automation', href: '/admin/automation', capability: 'admin.dashboard.view' },
      // One row per automation from its own records (the operating model's A4 and A5, 19 November 2026).
      { label: 'Engine', href: '/admin/engine', capability: 'admin.dashboard.view' },
      { label: 'Feature flags', href: '/admin/flags', capability: 'admin.flags.manage' },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    items: [
      { label: 'Orders', href: '/admin/orders', capability: 'admin.refunds.process' },
      { label: 'Money taken, no ticket', href: '/admin/orders/unfulfilled', capability: 'admin.refunds.process' },
      { label: 'Refunds', href: '/admin/refunds', capability: 'admin.refunds.process' },
      { label: 'Disputes', href: '/admin/disputes', capability: 'admin.disputes.manage' },
      { label: 'Payouts', href: '/admin/payouts', capability: 'admin.payouts.disburse' },
      { label: 'Pricing and fees', href: '/admin/pricing', capability: 'admin.pricing.manage' },
      { label: 'Promotions', href: '/admin/promotions', capability: 'admin.pricing.manage' },
      { label: 'Analytics (GMV)', href: '/admin/analytics', capability: 'admin.pricing.manage' },
      { label: 'Venue revenue', href: '/admin/venues', capability: 'admin.venues.manage' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { label: 'Admin staff', href: '/admin/staff', capability: 'admin.invites.manage' },
      { label: 'Marketplace', href: '/admin/marketplace', capability: 'admin.marketplace.manage' },
      { label: 'Audit', href: '/admin/audit', capability: 'admin.audit.read' },
    ],
  },
]

/** Every item, in group order: the flat list older readers take. */
export const ADMIN_NAV: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items)

export interface AdminNavLink {
  label: string
  href: string
}

export interface AdminNavGroupLinks {
  key: AdminNavGroupKey
  label: string
  items: AdminNavLink[]
}

/** The nav links the given capabilities may see, label + href only. */
export function filterNav(capabilities: readonly string[]): AdminNavLink[] {
  return ADMIN_NAV.filter(i => capabilities.includes(i.capability)).map(({ label, href }) => ({ label, href }))
}

/** The groups the given capabilities may see, each with only its visible links; an empty group is left out. */
export function filterNavGroups(capabilities: readonly string[]): AdminNavGroupLinks[] {
  return ADMIN_NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: g.items.filter((i) => capabilities.includes(i.capability)).map(({ label, href }) => ({ label, href })),
  })).filter((g) => g.items.length > 0)
}

/** The group a path belongs to, for the active state: the longest href that is the path or a parent of it. */
export function activeHref(pathname: string, links: readonly AdminNavLink[]): string | null {
  let best: string | null = null
  for (const l of links) {
    const hit = pathname === l.href || (l.href !== '/admin' && pathname.startsWith(`${l.href}/`))
    if (hit && (best === null || l.href.length > best.length)) best = l.href
  }
  if (best === null && pathname === '/admin') return '/admin'
  return best
}
