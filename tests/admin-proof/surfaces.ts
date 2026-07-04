/**
 * The admin surfaces captured for proof. Each is a public-in-admin route that
 * renders real data once authenticated. Search carries a query so results
 * populate; the rest load their own live data.
 */
export interface AdminSurface {
  name: string
  path: string
  /** A heading or text we wait for so the screenshot is of settled content. */
  ready: RegExp
}

export const ADMIN_SURFACES: AdminSurface[] = [
  { name: 'dashboard', path: '/admin', ready: /operations dashboard/i },
  { name: 'refunds', path: '/admin/refunds', ready: /refunds/i },
  { name: 'disputes', path: '/admin/disputes', ready: /disputes/i },
  { name: 'kyc', path: '/admin/kyc', ready: /kyc review/i },
  { name: 'search', path: '/admin/search?q=a', ready: /results for|search/i },
  { name: 'notifications', path: '/admin/notifications', ready: /notifications/i },
  { name: 'events', path: '/admin/events', ready: /events/i },
  { name: 'organisers', path: '/admin/organisers', ready: /organisers/i },
  { name: 'payouts', path: '/admin/payouts', ready: /payouts/i },
  { name: 'staff', path: '/admin/staff', ready: /admin staff|staff/i },
]
