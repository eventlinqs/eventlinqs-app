import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import type { AdminSession } from '@/lib/admin/types'
import type { Database } from '@/types/database'

/**
 * M7 user role management (scope 3.5).
 *
 * Lists profiles and changes profiles.role, audit-logged old -> new.
 *
 * Security: the only roles this UI may *assign* are attendee and organiser.
 * Granting platform admin / super_admin is an escalation path and is
 * deliberately not exposed here - it stays a manual, considered operation.
 * Existing admin / super_admin profiles are listed and may be demoted to
 * attendee or organiser, but never promoted through this surface.
 *
 * Note: profiles.role is the platform user role and is distinct from the
 * admin_users RBAC that gates the admin console itself. Changing a profile
 * role here does not grant admin-console access.
 */

type UserRole = Database['public']['Enums']['user_role']

// Roles an admin may assign through this UI. Escalation to platform admin is
// intentionally excluded (see file header).
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['attendee', 'organiser']

export const USER_ROLE_FILTERS: readonly (UserRole | 'all')[] = [
  'all',
  'attendee',
  'organiser',
  'admin',
  'super_admin',
]

export function isAssignableRole(role: string): role is UserRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

export interface AdminUserListRow {
  id: string
  email: string
  name: string | null
  role: UserRole
  isVerified: boolean
  createdAt: string
}

export interface UserListFilters {
  role?: UserRole | 'all'
  search?: string
  page?: number
}

export interface UserListResult {
  rows: AdminUserListRow[]
  page: number
  pageSize: number
  hasMore: boolean
}

const PAGE_SIZE = 25

export async function listProfiles(filters: UserListFilters): Promise<UserListResult> {
  const admin = createAdminClient()
  const page = Math.max(filters.page ?? 1, 1)
  const fromIdx = (page - 1) * PAGE_SIZE

  let q = admin
    .from('profiles')
    .select('id, email, full_name, display_name, role, is_verified, created_at')
    .order('created_at', { ascending: false })
    .range(fromIdx, fromIdx + PAGE_SIZE)

  if (filters.role && filters.role !== 'all') q = q.eq('role', filters.role)
  if (filters.search) {
    const term = `%${filters.search}%`
    q = q.or(`email.ilike.${term},full_name.ilike.${term},display_name.ilike.${term}`)
  }

  const { data, error } = await q
  if (error) throw error

  const raw = data ?? []
  const hasMore = raw.length > PAGE_SIZE
  const trimmed = hasMore ? raw.slice(0, PAGE_SIZE) : raw

  return {
    rows: trimmed.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.full_name || r.display_name || null,
      role: r.role,
      isVerified: r.is_verified,
      createdAt: r.created_at,
    })),
    page,
    pageSize: PAGE_SIZE,
    hasMore,
  }
}

export interface ChangeRoleResult {
  ok: boolean
  changed: boolean
  error?: string
}

/**
 * Sets a profile's role to one of the assignable roles, audit-logged.
 * No-op (changed: false) when the role is already the requested value.
 */
export async function changeUserRole(
  input: { userId: string; newRole: UserRole; reason?: string },
  session: AdminSession,
): Promise<ChangeRoleResult> {
  if (!isAssignableRole(input.newRole)) {
    return { ok: false, changed: false, error: 'Role is not assignable through this UI' }
  }
  const admin = createAdminClient()

  const { data: current, error: readErr } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', input.userId)
    .maybeSingle()
  if (readErr) return { ok: false, changed: false, error: readErr.message }
  if (!current) return { ok: false, changed: false, error: 'User not found' }
  if (current.role === input.newRole) return { ok: true, changed: false }

  const { error: updErr } = await admin
    .from('profiles')
    .update({ role: input.newRole, updated_at: new Date().toISOString() })
    .eq('id', input.userId)
  if (updErr) return { ok: false, changed: false, error: updErr.message }

  await recordAuditEvent({
    action: 'admin.user.role_changed',
    targetType: 'profile',
    targetId: input.userId,
    metadata: {
      email: current.email,
      oldRole: current.role,
      newRole: input.newRole,
      reason: input.reason?.trim() || null,
    },
    session,
  })

  return { ok: true, changed: true }
}
