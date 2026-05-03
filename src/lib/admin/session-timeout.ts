/**
 * Admin session inactivity timeout.
 *
 * 4 hours of inactivity forces re-authentication. Inactivity is checked
 * server-side from the admin_users.last_login_at value plus a sliding
 * activity timestamp held in a session cookie set by the admin shell.
 */

export const ADMIN_SESSION_INACTIVITY_MS = 4 * 60 * 60 * 1000

export const ADMIN_ACTIVITY_COOKIE = 'el_admin_active'

export function isAdminSessionFresh(lastActivityIso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastActivityIso) return false
  const lastMs = Date.parse(lastActivityIso)
  if (Number.isNaN(lastMs)) return false
  return nowMs - lastMs < ADMIN_SESSION_INACTIVITY_MS
}
