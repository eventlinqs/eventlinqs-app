import type { AdminRole } from './types'

/**
 * RBAC capability registry.
 *
 * Capabilities are typed strings (`namespace.action`) that the UI and API
 * layers reference. Roles map to capability sets here, in one place. To
 * grant a role a new capability, edit ROLE_CAPABILITIES below.
 *
 * Phase A1 ships only the capabilities A1 actually uses. Later phases
 * extend this map.
 */

export type AdminCapability =
  // A1
  | 'admin.dashboard.view'
  | 'admin.audit.read'
  | 'admin.invites.manage'
  | 'admin.profile.read'

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  super_admin: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.audit.read',
    'admin.invites.manage',
    'admin.profile.read',
  ]),
  admin: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.audit.read',
    'admin.invites.manage',
    'admin.profile.read',
  ]),
  support: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.audit.read',
    'admin.profile.read',
  ]),
  moderator: new Set<AdminCapability>([
    'admin.dashboard.view',
    'admin.profile.read',
  ]),
}

export function hasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return ROLE_CAPABILITIES[role].has(capability)
}

export function assertCapability(role: AdminRole, capability: AdminCapability): void {
  if (!hasCapability(role, capability)) {
    throw new AdminForbiddenError(role, capability)
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
