import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import type { AdminSession } from '@/lib/admin/types'
import type { Database } from '@/types/database'

/**
 * M7 event moderation - pause / resume / cancel (scope 3.7).
 *
 * Transitions events.status. Pausing a published event hides it from sale
 * surfaces (status != published); resuming republishes it; cancelling is
 * terminal. Every transition is guarded by allowed source states, applied
 * with a conditional status filter so a concurrent change is not clobbered,
 * and audit-logged old -> new.
 *
 * This module owns only the events.status column for moderation. The
 * feature / unfeature toggle (is_featured) is deliberately NOT here - it
 * waits on its migration.
 */

type EventStatus = Database['public']['Enums']['event_status']

export type EventAction = 'pause' | 'resume' | 'cancel'

interface ActionSpec {
  from: readonly EventStatus[]
  to: EventStatus
  auditAction: string
}

const ACTION_SPECS: Record<EventAction, ActionSpec> = {
  pause: { from: ['published'], to: 'paused', auditAction: 'admin.event.paused' },
  resume: { from: ['paused'], to: 'published', auditAction: 'admin.event.resumed' },
  cancel: {
    from: ['draft', 'scheduled', 'published', 'paused', 'postponed'],
    to: 'cancelled',
    auditAction: 'admin.event.cancelled',
  },
}

export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
}

/** Actions available from a given current status (drives the row buttons). */
export function actionsForEventStatus(status: EventStatus): EventAction[] {
  return (Object.keys(ACTION_SPECS) as EventAction[]).filter((a) => ACTION_SPECS[a].from.includes(status))
}

export interface AdminEventRow {
  id: string
  title: string
  slug: string
  status: EventStatus
  organisationName: string | null
  startDate: string
  createdAt: string
}

export const EVENT_STATUS_FILTERS: readonly (EventStatus | 'all')[] = [
  'all',
  'draft',
  'scheduled',
  'published',
  'paused',
  'postponed',
  'cancelled',
  'completed',
]

export interface EventListFilters {
  status?: EventStatus | 'all'
  search?: string
  page?: number
}

export interface EventListResult {
  rows: AdminEventRow[]
  page: number
  pageSize: number
  hasMore: boolean
}

const PAGE_SIZE = 25

export async function listEvents(filters: EventListFilters): Promise<EventListResult> {
  const admin = createAdminClient()
  const page = Math.max(filters.page ?? 1, 1)
  const fromIdx = (page - 1) * PAGE_SIZE

  let q = admin
    .from('events')
    .select('id, title, slug, status, start_date, created_at, organisations(name)')
    .order('created_at', { ascending: false })
    .range(fromIdx, fromIdx + PAGE_SIZE)

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.search) {
    const term = `%${filters.search}%`
    q = q.or(`title.ilike.${term},slug.ilike.${term}`)
  }

  const { data, error } = await q
  if (error) throw error

  const raw = (data ?? []) as Array<{
    id: string
    title: string
    slug: string
    status: EventStatus
    start_date: string
    created_at: string
    organisations: { name: string } | { name: string }[] | null
  }>
  const hasMore = raw.length > PAGE_SIZE
  const trimmed = hasMore ? raw.slice(0, PAGE_SIZE) : raw

  return {
    rows: trimmed.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      status: r.status,
      organisationName: orgName(r.organisations),
      startDate: r.start_date,
      createdAt: r.created_at,
    })),
    page,
    pageSize: PAGE_SIZE,
    hasMore,
  }
}

function orgName(org: { name: string } | { name: string }[] | null): string | null {
  if (!org) return null
  if (Array.isArray(org)) return org[0]?.name ?? null
  return org.name ?? null
}

export interface EventActionResult {
  ok: boolean
  error?: string
  invalidTransition?: boolean
}

/**
 * Applies a moderation action to one event, guarded by allowed source states,
 * then audit-logs old -> new. The update is conditional on the row still being
 * in an allowed source state so a concurrent change cannot be clobbered.
 */
export async function applyEventAction(
  input: { eventId: string; action: EventAction; reason?: string },
  session: AdminSession,
): Promise<EventActionResult> {
  const admin = createAdminClient()
  const spec = ACTION_SPECS[input.action]

  const { data: current, error: readErr } = await admin
    .from('events')
    .select('id, title, status')
    .eq('id', input.eventId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!current) return { ok: false, error: 'Event not found' }
  if (!spec.from.includes(current.status)) return { ok: false, invalidTransition: true }

  const reason = input.reason?.trim() || null

  const { data: updated, error: updErr } = await admin
    .from('events')
    .update({ status: spec.to, updated_at: new Date().toISOString() })
    .eq('id', input.eventId)
    .in('status', spec.from as unknown as string[])
    .select('id')
    .maybeSingle()
  if (updErr) return { ok: false, error: updErr.message }
  if (!updated) return { ok: false, invalidTransition: true }

  await recordAuditEvent({
    action: spec.auditAction,
    targetType: 'event',
    targetId: input.eventId,
    metadata: {
      title: current.title,
      oldStatus: current.status,
      newStatus: spec.to,
      reason,
    },
    session,
  })

  return { ok: true }
}
