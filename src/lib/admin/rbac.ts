import type { AdminRole, AdminSession, AdminUserRow } from './types'

/**
 * RBAC capability registry.
 *
 * Capabilities are typed strings (`namespace.action`) that the UI and API
 * layers reference. Roles map to capability sets here, in one place. A user's
 * EFFECTIVE capabilities are their role set, plus per-user grants, minus
 * per-user revokes (resolveCapabilities). super_admin always has every
 * capability and ignores overrides, so the founder retains override of
 * everything and can never be locked out of a capability.
 *
 * Enforcement uses the session's effective set (can / assertCan). The
 * role-only helpers (hasCapability / assertCapability) remain for the role
 * matrix display.
 */

export type AdminCapability =
  // A1
  | 'admin.dashboard.view'
  | 'admin.audit.read'
  | 'admin.invites.manage'
  | 'admin.profile.read'
  // M7 operational controls
  | 'admin.pricing.manage'
  | 'admin.users.manage'
  | 'admin.events.manage'
  // M6 refund operator path
  | 'admin.refunds.process'
  // M6 payout management
  | 'admin.payouts.disburse'

/** Every capability, in display order. Source of truth for the role matrix. */
export const ALL_CAPABILITIES: readonly AdminCapability[] = [
  'admin.dashboard.view',
  'admin.audit.read',
  'admin.profile.read',
  'admin.invites.manage',
  'admin.users.manage',
  'admin.events.manage',
  'admin.pricing.manage',
  'admin.refunds.process',
  'admin.payouts.disburse',
]

/** Human-readable capability descriptions for the admin UI matrix. */
export const CAPABILITY_LABELS: Record<AdminCapability, string> = {
  'admin.dashboard.view': 'View dashboard',
  'admin.audit.read': 'Read audit log',
  'admin.profile.read': 'View own profile',
  'admin.invites.manage': 'Manage admin staff',
  'admin.users.manage': 'Manage members and organisers',
  'admin.events.manage': 'Manage and moderate events',
  'admin.pricing.manage': 'Manage pricing and fees',
  'admin.refunds.process': 'Process refunds',
  'admin.payouts.disburse': 'Disburse payouts',
}

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  super_admin: new Set<AdminCapability>(ALL_CAPABILITIES),
  admin: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.audit.read',
    'admin.invites.manage',
    'admin.profile.read',
    'admin.pricing.manage',
    'admin.users.manage',
    'admin.events.manage',
    'admin.refunds.process',
    'admin.payouts.disburse',
  ]),
  support: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.audit.read',
    'admin.profile.read',
    'admin.refunds.process',
  ]),
  // Moderator can action events (moderation) but not pricing or users.
  moderator: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.profile.read',
    'admin.events.manage',
  ]),
}

export function isAdminCapability(value: string): value is AdminCapability {
  return (ALL_CAPABILITIES as readonly string[]).includes(value)
}

/** The role's baseline capability set (no per-user overrides). */
export function roleCapabilities(role: AdminRole): ReadonlySet<AdminCapability> {
  return ROLE_CAPABILITIES[role]
}

/**
 * Effective capabilities for an admin user: role set + grants - revokes.
 * super_admin always returns the full set and ignores overrides (founder
 * override of everything).
 */
export function resolveCapabilities(
  admin: Pick<AdminUserRow, 'role' | 'capabilities_granted' | 'capabilities_revoked'>,
): AdminCapability[] {
  if (admin.role === 'super_admin') return [...ALL_CAPABILITIES]
  const set = new Set<AdminCapability>(ROLE_CAPABILITIES[admin.role])
  for (const c of admin.capabilities_granted ?? []) {
    if (isAdminCapability(c)) set.add(c)
  }
  for (const c of admin.capabilities_revoked ?? []) {
    if (isAdminCapability(c)) set.delete(c)
  }
  return ALL_CAPABILITIES.filter((c) => set.has(c))
}

// --- Role-baseline helpers (used by the role matrix display) ----------------

export function hasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return ROLE_CAPABILITIES[role].has(capability)
}

export function assertCapability(role: AdminRole, capability: AdminCapability): void {
  if (!hasCapability(role, capability)) {
    throw new AdminForbiddenError(role, capability)
  }
}

// --- Session enforcement (effective capabilities, override-aware) -----------

/** Whether the session's effective capabilities include `capability`. */
export function can(session: AdminSession, capability: AdminCapability): boolean {
  return session.capabilities.includes(capability)
}

/** Throws AdminForbiddenError unless the session can do `capability`. */
export function assertCan(session: AdminSession, capability: AdminCapability): void {
  if (!can(session, capability)) {
    throw new AdminForbiddenError(session.admin.role, capability)
  }
}

export class AdminForbiddenError extends Error {
  constructor(public role: AdminRole, public capability: AdminCapability) {
    super(`role ${role} lacks capability ${capability}`)
    this.name = 'AdminForbiddenError'
  }
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  support: 'Support',
  moderator: 'Moderator',
}

/** Short description of each role for the admin UI. */
export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Full control of everything, including admin staff and pricing. Cannot be limited.',
  admin: 'Operational control: pricing, members, events, refunds, payouts. Not staff-locked out.',
  support: 'Refunds and read access (dashboard, audit). No pricing, staff, or event control.',
  moderator: 'Event moderation only. No pricing, members, refunds, or payouts.',
}
