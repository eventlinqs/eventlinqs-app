import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCapabilities } from './rbac'
import type { AdminSession, AdminUserRow } from './types'

/**
 * Server-side admin session resolution.
 *
 * Reads the current auth user from the SSR Supabase client, then looks up
 * the matching admin_users row through the service-role client (the row
 * select is RLS-allowed for any active admin, but we use the service-role
 * here so that a brand-new admin without a session cookie still resolves
 * to null cleanly).
 *
 * Returns null when:
 *   - no auth.users session
 *   - the user has no admin_users row
 *   - the admin is disabled
 */

export async function getAdminSession(): Promise<AdminSession | null> {
  const supa = await createServerSupabase()
  const { data: userData, error: userErr } = await supa.auth.getUser()
  if (userErr || !userData.user) return null

  const admin = await createAdminClient()
    .from('admin_users')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle<AdminUserRow>()

  if (admin.error || !admin.data) return null
  if (admin.data.disabled_at) return null

  // Normalise override columns (absent until the migration is applied) so the
  // resolver is safe pre-migration, then compute the effective capability set.
  const adminRow: AdminUserRow = {
    ...admin.data,
    capabilities_granted: admin.data.capabilities_granted ?? [],
    capabilities_revoked: admin.data.capabilities_revoked ?? [],
  }

  return {
    userId: userData.user.id,
    email: userData.user.email ?? '',
    admin: adminRow,
    capabilities: resolveCapabilities(adminRow),
  }
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) {
    throw new AdminUnauthorisedError()
  }
  return session
}

export class AdminUnauthorisedError extends Error {
  constructor() {
    super('admin session required')
    this.name = 'AdminUnauthorisedError'
  }
}
