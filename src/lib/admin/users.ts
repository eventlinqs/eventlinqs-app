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

export interface AdminUserDetail {
  id: string
  email: string
  fullName: string | null
  displayName: string | null
  avatarUrl: string | null
  role: UserRole
  isVerified: boolean
  onboardingCompleted: boolean
  phone: string | null
  createdAt: string
  // Account status from auth.users (Supabase ban mechanism).
  suspended: boolean
  bannedUntil: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  // Activity summary.
  ordersCount: number
  eventsCreatedCount: number
}

/**
 * Member-360 detail: profile, account status (via the Auth admin API's
 * banned_until), and an activity summary. Returns null if the profile is
 * missing. The suspend mechanism is Supabase's built-in ban (auth.users.
 * banned_until), never an invented profiles column.
 */
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, display_name, avatar_url, role, is_verified, onboarding_completed, phone, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return null

  // Account status via the Auth admin API (authoritative for ban state).
  let bannedUntil: string | null = null
  let lastSignInAt: string | null = null
  let emailConfirmedAt: string | null = null
  const { data: authData } = await admin.auth.admin.getUserById(userId)
  const authUser = authData?.user as { banned_until?: string | null; last_sign_in_at?: string | null; email_confirmed_at?: string | null } | undefined
  if (authUser) {
    bannedUntil = authUser.banned_until ?? null
    lastSignInAt = authUser.last_sign_in_at ?? null
    emailConfirmedAt = authUser.email_confirmed_at ?? null
  }
  const suspended = bannedUntil !== null && new Date(bannedUntil).getTime() > Date.now()

  const [{ count: ordersCount }, { count: eventsCreatedCount }] = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('created_by', userId),
  ])

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name ?? null,
    displayName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    role: profile.role,
    isVerified: profile.is_verified,
    onboardingCompleted: profile.onboarding_completed,
    phone: profile.phone ?? null,
    createdAt: profile.created_at,
    suspended,
    bannedUntil,
    lastSignInAt,
    emailConfirmedAt,
    ordersCount: ordersCount ?? 0,
    eventsCreatedCount: eventsCreatedCount ?? 0,
  }
}

/**
 * Suspends or reactivates a user via the Supabase Auth admin ban mechanism
 * (auth.users.banned_until). Suspending sets a long ban that blocks sign-in
 * and revokes sessions; reactivating clears it. Audit-logged. Does not touch
 * the profiles table (no invented status column).
 */
export async function setUserSuspension(
  input: { userId: string; suspend: boolean; reason?: string },
  session: AdminSession,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  // Guard: never suspend a platform admin / super_admin through this surface.
  const { data: target } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', input.userId)
    .maybeSingle()
  if (!target) return { ok: false, error: 'User not found' }
  if (input.suspend && (target.role === 'admin' || target.role === 'super_admin')) {
    return { ok: false, error: 'Cannot suspend a platform admin from this surface' }
  }

  // 'none' lifts the ban; a long duration suspends (sign-in blocked, sessions revoked).
  const ban_duration = input.suspend ? '876000h' : 'none'
  const { error } = await admin.auth.admin.updateUserById(input.userId, { ban_duration })
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: input.suspend ? 'admin.user.suspended' : 'admin.user.reactivated',
    targetType: 'profile',
    targetId: input.userId,
    metadata: { email: target.email, reason: input.reason?.trim() || null },
    session,
  })

  return { ok: true }
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
