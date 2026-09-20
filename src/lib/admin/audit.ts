import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import type { AdminSession, AuditLogRow } from './types'

/**
 * Append-only audit log writer.
 *
 * Every admin action records an entry. Failures here MUST NOT throw to the
 * caller: an audit write that fails is not a reason to fail the action that was
 * already taken.
 *
 * ---------------------------------------------------------------------------
 * WHAT THAT PROMISE USED TO MEAN, until 20 September 2026: nothing, quietly.
 *
 * ONE. THE TRY/CATCH COULD NOT SEE THE FAILURE IT WAS WRITTEN FOR. The insert
 * was `await createAdminClient().from('audit_log').insert({...})` with no
 * destructure at all. A PostgREST client REPORTS a refused write in `error` and
 * does not throw, so a refusal, an RLS denial, a constraint, a bad column, came
 * back as a resolved promise and fell straight through the `try`. The catch
 * only ever guarded `headers()`.
 *
 * TWO. IN PRODUCTION IT SAID NOTHING AT ALL. The catch logged only when
 * `NODE_ENV !== 'production'`, so the one environment where an audit trail is
 * evidence is the one where its absence left no trace. The comment said the
 * Sentry hook "lands in Session 2 hardening"; Session 2 was months ago.
 *
 * Together those two mean the audit log could silently not exist. On a platform
 * that suspends organisers, moves fee-free windows and holds payouts, the
 * entry nobody can find afterwards is indistinguishable from the action nobody
 * took.
 *
 * Both writers now bind the insert's `error`, report every failure through the
 * error reporter in EVERY environment, and return whether the entry was
 * recorded so a caller that cares can ask. Neither throws, which is the part of
 * the original contract that was right.
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

/**
 * Whether the entry reached the table. Callers are free to ignore it, and most
 * do, because an audit failure never fails the action. It exists so that a
 * caller who WANTS to know can ask, instead of the answer being unavailable to
 * everybody.
 */
export interface AuditWriteResult {
  recorded: boolean
}

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

/**
 * THE ONE PLACE AN AUDIT FAILURE IS REPORTED, so the two writers cannot drift
 * into reporting it differently, and so a future third writer has somewhere
 * obvious to call.
 *
 * It reports in EVERY environment, deliberately. A missing audit entry matters
 * most in production and that is exactly where the old code was silent.
 */
function auditCouldNotBeWritten(action: string, cause: unknown): { recorded: false } {
  const reason = cause instanceof Error ? cause.message : String(cause)
  console.error('[audit] the entry for %s was NOT written: %s', action, reason)
  captureException(cause instanceof Error ? cause : new Error(`audit write failed for ${action}: ${reason}`), {
    scope: 'admin-audit',
    handler: 'record',
    action,
  })
  return { recorded: false }
}

export async function recordAuditEvent(input: AuditWriteInput): Promise<AuditWriteResult> {
  const { action, targetType, targetId, metadata = {}, session } = input
  try {
    const headerList = await headers()
    const ip = clientIpFromHeaders(headerList)
    const userAgent = headerList.get('user-agent')

    const { error } = await createAdminClient()
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
    if (error) return auditCouldNotBeWritten(action, new Error(error.message))
    return { recorded: true }
  } catch (err) {
    return auditCouldNotBeWritten(action, err)
  }
}

export async function recordAnonAuditEvent(input: AuditAnonInput): Promise<AuditWriteResult> {
  const { action, metadata = {}, actorEmail, ip, userAgent } = input
  try {
    const headerList = await headers()
    const resolvedIp = ip ?? clientIpFromHeaders(headerList)
    const resolvedUa = userAgent ?? headerList.get('user-agent')
    const { error } = await createAdminClient()
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
    if (error) return auditCouldNotBeWritten(action, new Error(error.message))
    return { recorded: true }
  } catch (err) {
    return auditCouldNotBeWritten(action, err)
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
