import 'server-only'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventStatus } from '@/types/database'

/**
 * EVERY ARCHIVE, RESTORE AND DELETE WRITES ONE AUDIT ROW: who, what, when,
 * from where, and the event's state at the time (close-out C13.7).
 *
 * The rows land in the same `audit_log` the admin console reads, so the
 * existing /admin/audit view lists them beside every admin action, filterable
 * by these three action names and by the `event` target type. The admin
 * console itself records through `recordAuditEvent` with its session, exactly
 * as every other admin action does; this writer is for the ORGANISER path,
 * where there is no AdminSession to hand over, and it records the actor's role
 * snapshot as `organiser`.
 *
 * A failure here is logged and does not throw: refusing to archive an event
 * because the audit write failed would turn a missing log line into a stuck
 * event. It is not swallowed either; the no-silent-catch guard reads this file.
 */

export const LIFECYCLE_AUDIT_ACTIONS = ['event.archived', 'event.restored', 'event.deleted'] as const
export type LifecycleAuditAction = (typeof LIFECYCLE_AUDIT_ACTIONS)[number]

export interface LifecycleActor {
  id: string
  email: string | null
  /** `organiser`, or the admin role when the admin path shares this writer. */
  role: string
}

export interface LifecycleEventState {
  id: string
  slug: string | null
  title: string
  organisation_id: string | null
  status: EventStatus
  archived_from_status?: EventStatus | null
}

export async function recordLifecycleAudit(input: {
  action: LifecycleAuditAction
  actor: LifecycleActor
  event: LifecycleEventState
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const headerList = await headers()
    const forwarded = headerList.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip')
    const userAgent = headerList.get('user-agent')

    const { error } = await createAdminClient()
      .from('audit_log')
      .insert({
        actor_id: input.actor.id,
        actor_email_snapshot: input.actor.email,
        actor_role_snapshot: input.actor.role,
        action: input.action,
        target_type: 'event',
        target_id: input.event.id,
        metadata: {
          title: input.event.title,
          slug: input.event.slug,
          organisationId: input.event.organisation_id,
          statusAtTheTime: input.event.status,
          archivedFromStatus: input.event.archived_from_status ?? null,
          ...(input.metadata ?? {}),
        },
        ip,
        user_agent: userAgent,
      })
    if (error) {
      console.error('[lifecycle-audit] failed to record', input.action, 'for event', input.event.id, error)
    }
  } catch (err) {
    console.error('[lifecycle-audit] failed to record', input.action, 'for event', input.event.id, err)
  }
}
