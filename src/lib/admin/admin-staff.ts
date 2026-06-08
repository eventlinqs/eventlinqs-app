import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import {
  ALL_CAPABILITIES,
  isAdminCapability,
  resolveCapabilities,
  type AdminCapability,
} from '@/lib/admin/rbac'
import type { AdminRole, AdminSession, AdminUserRow } from '@/lib/admin/types'

/**
 * Admin STAFF management (the admin_users RBAC that gates the admin console),
 * distinct from /admin/users which manages platform members (profiles).
 *
 * Privilege separation (enforced here, not just in the UI):
 *   - Every operation requires the caller's `admin.invites.manage` capability
 *     (asserted by the calling server action).
 *   - Only a super_admin may create or modify a super_admin, grant the
 *     super_admin role, or tune per-user capability overrides (the finest
 *     escalation lever). A regular admin can manage support/moderator staff.
 *   - The last enabled super_admin can never be disabled or demoted
 *     (lockout guard). The founder retains override of everything.
 *
 * Every mutation is audit-logged.
 */

export const ASSIGNABLE_ADMIN_ROLES: readonly AdminRole[] = [
  'super_admin',
  'admin',
  'support',
  'moderator',
]

export interface AdminStaffRow {
  id: string
  email: string
  displayName: string
  role: AdminRole
  disabled: boolean
  totpEnrolled: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface AdminStaffDetail extends AdminStaffRow {
  capabilitiesGranted: string[]
  capabilitiesRevoked: string[]
  effectiveCapabilities: AdminCapability[]
}

type StaffResult = { ok: boolean; error?: string }

async function emailsFor(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, email')
    .in('id', ids)
  for (const p of data ?? []) map.set(p.id, p.email)
  return map
}

/** Lists every admin_users row (the console staff) with their email. */
export async function listAdminStaff(): Promise<AdminStaffRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('admin_users')
    .select('id, role, display_name, disabled_at, totp_enrolled_at, last_login_at, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  const emails = await emailsFor(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    email: emails.get(r.id) ?? '(unknown)',
    displayName: r.display_name,
    role: r.role,
    disabled: r.disabled_at !== null,
    totpEnrolled: r.totp_enrolled_at !== null,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  }))
}

export async function getAdminStaffDetail(id: string): Promise<AdminStaffDetail | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('*')
    .eq('id', id)
    .maybeSingle<AdminUserRow>()
  if (!data) return null
  const emails = await emailsFor([id])
  const granted = data.capabilities_granted ?? []
  const revoked = data.capabilities_revoked ?? []
  return {
    id: data.id,
    email: emails.get(id) ?? '(unknown)',
    displayName: data.display_name,
    role: data.role,
    disabled: data.disabled_at !== null,
    totpEnrolled: data.totp_enrolled_at !== null,
    lastLoginAt: data.last_login_at,
    createdAt: data.created_at,
    capabilitiesGranted: granted,
    capabilitiesRevoked: revoked,
    effectiveCapabilities: resolveCapabilities({ role: data.role, capabilities_granted: granted, capabilities_revoked: revoked }),
  }
}

async function countEnabledSuperAdmins(excludeId?: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('id')
    .eq('role', 'super_admin')
    .is('disabled_at', null)
  return (data ?? []).filter((r) => r.id !== excludeId).length
}

function callerIsSuperAdmin(session: AdminSession): boolean {
  return session.admin.role === 'super_admin'
}

/**
 * Grants admin-console access to an EXISTING platform account, by email.
 * The person must have signed up first (an auth.users / profiles row must
 * exist). Mirrors the proven grant migration, from the panel.
 */
export async function addAdminByEmail(
  input: { email: string; role: AdminRole; displayName?: string },
  session: AdminSession,
): Promise<StaffResult> {
  const role = input.role
  if (!ASSIGNABLE_ADMIN_ROLES.includes(role)) return { ok: false, error: 'Invalid role' }
  if (role === 'super_admin' && !callerIsSuperAdmin(session)) {
    return { ok: false, error: 'Only a super admin can create a super admin' }
  }
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, display_name')
    .ilike('email', input.email.trim())
    .maybeSingle()
  if (!profile) {
    return { ok: false, error: 'No account with that email. Ask them to sign up first, then add them.' }
  }

  const { data: existing } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', profile.id)
    .maybeSingle()
  if (existing) return { ok: false, error: 'That account is already an admin. Edit them from the staff list.' }

  const displayName = input.displayName?.trim() || profile.full_name || profile.display_name || profile.email
  const { error } = await admin.from('admin_users').insert({
    id: profile.id,
    role,
    display_name: displayName,
    created_by: session.userId,
  })
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: 'admin.staff.added',
    targetType: 'admin_user',
    targetId: profile.id,
    metadata: { email: profile.email, role, displayName },
    session,
  })
  return { ok: true }
}

export async function setAdminRole(
  input: { id: string; role: AdminRole; reason?: string },
  session: AdminSession,
): Promise<StaffResult> {
  if (!ASSIGNABLE_ADMIN_ROLES.includes(input.role)) return { ok: false, error: 'Invalid role' }
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('admin_users')
    .select('id, role, display_name, disabled_at')
    .eq('id', input.id)
    .maybeSingle()
  if (!target) return { ok: false, error: 'Admin not found' }
  if (target.role === input.role) return { ok: true }

  // Only a super_admin may touch a super_admin or mint a new one.
  if ((target.role === 'super_admin' || input.role === 'super_admin') && !callerIsSuperAdmin(session)) {
    return { ok: false, error: 'Only a super admin can change a super admin role' }
  }
  // Never demote the last enabled super_admin.
  if (target.role === 'super_admin' && input.role !== 'super_admin') {
    if ((await countEnabledSuperAdmins(target.id)) === 0) {
      return { ok: false, error: 'Cannot demote the last super admin' }
    }
  }

  const { error } = await admin
    .from('admin_users')
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: 'admin.staff.role_changed',
    targetType: 'admin_user',
    targetId: input.id,
    metadata: { oldRole: target.role, newRole: input.role, reason: input.reason?.trim() || null },
    session,
  })
  return { ok: true }
}

export async function setAdminDisabled(
  input: { id: string; disabled: boolean; reason?: string },
  session: AdminSession,
): Promise<StaffResult> {
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('admin_users')
    .select('id, role, display_name, disabled_at')
    .eq('id', input.id)
    .maybeSingle()
  if (!target) return { ok: false, error: 'Admin not found' }

  if (target.role === 'super_admin' && !callerIsSuperAdmin(session)) {
    return { ok: false, error: 'Only a super admin can enable or disable a super admin' }
  }
  if (input.disabled && target.role === 'super_admin') {
    if ((await countEnabledSuperAdmins(target.id)) === 0) {
      return { ok: false, error: 'Cannot disable the last super admin' }
    }
  }
  if (input.disabled && input.id === session.userId) {
    return { ok: false, error: 'You cannot disable your own admin access' }
  }

  const { error } = await admin
    .from('admin_users')
    .update({ disabled_at: input.disabled ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: input.disabled ? 'admin.staff.disabled' : 'admin.staff.enabled',
    targetType: 'admin_user',
    targetId: input.id,
    metadata: { role: target.role, reason: input.reason?.trim() || null },
    session,
  })
  return { ok: true }
}

/**
 * Sets a per-admin capability override (granted/revoked lists). Founder-only
 * (super_admin caller) because it is the finest escalation lever. A super_admin
 * TARGET is always full, so overrides do not apply to them.
 */
export async function setAdminCapabilities(
  input: { id: string; granted: string[]; revoked: string[]; reason?: string },
  session: AdminSession,
): Promise<StaffResult> {
  if (!callerIsSuperAdmin(session)) {
    return { ok: false, error: 'Only a super admin can tune capabilities' }
  }
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('admin_users')
    .select('id, role')
    .eq('id', input.id)
    .maybeSingle()
  if (!target) return { ok: false, error: 'Admin not found' }
  if (target.role === 'super_admin') {
    return { ok: false, error: 'A super admin always has every capability; overrides do not apply.' }
  }

  const granted = input.granted.filter(isAdminCapability)
  // A capability cannot be both granted and revoked; revoke wins is avoided by
  // excluding granted from revoked.
  const revoked = input.revoked.filter((c) => isAdminCapability(c) && !granted.includes(c as AdminCapability))

  const { error } = await admin
    .from('admin_users')
    .update({ capabilities_granted: granted, capabilities_revoked: revoked, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: 'admin.staff.capabilities_changed',
    targetType: 'admin_user',
    targetId: input.id,
    metadata: { granted, revoked, reason: input.reason?.trim() || null },
    session,
  })
  return { ok: true }
}

/** The full capability list for the override editor. */
export const STAFF_CAPABILITIES = ALL_CAPABILITIES
