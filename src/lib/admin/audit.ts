import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AdminSession, AuditLogRow } from './types'

/**
 * Append-only audit log writer.
 *
 * Every admin action records an entry. Failures here MUST NOT throw to
 * the caller - audit failures are logged separately. Session 2 owns the
 * Sentry hook that this module's failure path will eventually call.
 *
 * Reserved action namespaces (Phase A1):
 *   admin.session.login.success
 *   admin.session.login.failure
 *   admin.session.logout
 *   admin.totp.enrolled
 *   admin.totp.recovery_used
 *   admin.invite.created
 *   admin.invite.accepted
 *   admin.invite.revoked
 *   admin.audit.viewed
 */

export interface AuditWriteInput {
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  session: AdminSession
}

export interface AuditAnonInput {
  action: string
  metadata?: Record<string, unknown>
  actorEmail?: string
  ip?: string
  userAgent?: string
}

export async function recordAuditEvent(input: AuditWriteInput): Promise<void> {
  const { action, targetType, targetId, metadata = {}, session } = input
  try {
    const headerList = await headers()
    const ip = clientIpFromHeaders(headerList)
    const userAgent = headerList.get('user-agent')

    await createAdminClient()
      .from('audit_log')
      .insert({
        actor_id: session.userId,
        actor_email_snapshot: session.email,
        actor_role_snapshot: session.admin.role,
        action,
        target_type: targetType ?? null,
        target_id: targetId ?? null,
        metadata,
        ip,
        user_agent: userAgent,
      })
  } catch (err) {
    // Sentry hook lands in Session 2 hardening. Until then, swallow.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[audit] failed to record event', action, err)
    }
  }
}

export async function recordAnonAuditEvent(input: AuditAnonInput): Promise<void> {
  const { action, metadata = {}, actorEmail, ip, userAgent } = input
  try {
    const headerList = await headers()
    const resolvedIp = ip ?? clientIpFromHeaders(headerList)
    const resolvedUa = userAgent ?? headerList.get('user-agent')
    await createAdminClient()
      .from('audit_log')
      .insert({
        actor_id: null,
        actor_email_snapshot: actorEmail ?? null,
        actor_role_snapshot: null,
        action,
        target_type: null,
        target_id: null,
        metadata,
        ip: resolvedIp,
        user_agent: resolvedUa,
      })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[audit] failed to record anon event', action, err)
    }
  }
}

function clientIpFromHeaders(h: Headers): string | null {
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')
}

export interface AuditQueryFilters {
  fromIso?: string
  toIso?: string
  actorEmail?: string
  actions?: string[]
  targetTypes?: string[]
  cursor?: number
  limit?: number
}

export interface AuditQueryResult {
  rows: AuditLogRow[]
  nextCursor: number | null
}

export async function queryAuditLog(filters: AuditQueryFilters): Promise<AuditQueryResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  let q = createAdminClient()
    .from('audit_log')
    .select('*')
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (filters.cursor) q = q.lt('id', filters.cursor)
  if (filters.fromIso) q = q.gte('created_at', filters.fromIso)
  if (filters.toIso) q = q.lte('created_at', filters.toIso)
  if (filters.actorEmail) q = q.ilike('actor_email_snapshot', `%${filters.actorEmail}%`)
  if (filters.actions && filters.actions.length > 0) q = q.in('action', filters.actions)
  if (filters.targetTypes && filters.targetTypes.length > 0) q = q.in('target_type', filters.targetTypes)

  const { data, error } = await q.returns<AuditLogRow[]>()
  if (error) throw error

  const rows = data ?? []
  if (rows.length > limit) {
    const trimmed = rows.slice(0, limit)
    return { rows: trimmed, nextCursor: trimmed[trimmed.length - 1]?.id ?? null }
  }
  return { rows, nextCursor: null }
}
