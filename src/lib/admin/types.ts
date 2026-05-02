/**
 * Local types for the admin foundation tables.
 *
 * src/types/database.ts is a [SHARED] file owned by Session 2 and is
 * regenerated from Supabase. Until A1's migration ships and Session 2
 * regenerates database.ts, the admin lib uses these local types as the
 * source of truth for row shape.
 *
 * Mirror of supabase/migrations/20260502000003_admin_foundation.sql.
 */

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'moderator'

export interface AdminUserRow {
  id: string
  role: AdminRole
  display_name: string
  totp_secret_encrypted: string | null
  totp_enrolled_at: string | null
  totp_recovery_codes_hashed: string[]
  last_login_at: string | null
  last_login_ip: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface AdminInviteRow {
  id: string
  email: string
  role: AdminRole
  token_hash: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  created_by: string
  created_at: string
}

export interface AuditLogRow {
  id: number
  actor_id: string | null
  actor_email_snapshot: string | null
  actor_role_snapshot: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface AdminSession {
  userId: string
  email: string
  admin: AdminUserRow
}
