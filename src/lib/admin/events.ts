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

export interface AdminEventTier {
  id: string
  name: string
  priceCents: number
  currency: string
}

export interface AdminEventDetail {
  id: string
  title: string
  slug: string
  status: EventStatus
  visibility: string
  isFeatured: boolean
  feePassType: string
  organisationId: string
  organisationName: string | null
  startDate: string
  endDate: string
  maxCapacity: number | null
  isFree: boolean
  venueName: string | null
  city: string | null
  createdAt: string
  tiers: AdminEventTier[]
}

/** Full admin view of one event: core fields, organiser, and ticket tiers. */
export async function getAdminEventDetail(eventId: string): Promise<AdminEventDetail | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('events')
    .select(
      'id, title, slug, status, visibility, is_featured, is_free, fee_pass_type, organisation_id, start_date, end_date, max_capacity, venue_name, venue_city, city_primary, created_at, organisations(name)',
    )
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { data: tierRows } = await admin
    .from('ticket_tiers')
    .select('id, name, price, currency')
    .eq('event_id', eventId)
    .order('price', { ascending: true })

  const org = data.organisations as { name: string } | { name: string }[] | null
  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    status: data.status,
    visibility: String(data.visibility),
    isFeatured: data.is_featured,
    feePassType: String(data.fee_pass_type),
    organisationId: data.organisation_id,
    organisationName: orgName(org),
    startDate: data.start_date,
    endDate: data.end_date,
    maxCapacity: data.max_capacity,
    isFree: data.is_free ?? false,
    venueName: data.venue_name ?? null,
    city: data.venue_city ?? data.city_primary ?? null,
    createdAt: data.created_at,
    tiers: (tierRows ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      priceCents: t.price,
      currency: t.currency,
    })),
  }
}

/** Toggles an event's featured flag, audit-logged. */
export async function setEventFeatured(
  input: { eventId: string; featured: boolean },
  session: AdminSession,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: current } = await admin
    .from('events')
    .select('id, title, is_featured')
    .eq('id', input.eventId)
    .maybeSingle()
  if (!current) return { ok: false, error: 'Event not found' }
  if (current.is_featured === input.featured) return { ok: true }

  const { error } = await admin
    .from('events')
    .update({ is_featured: input.featured, updated_at: new Date().toISOString() })
    .eq('id', input.eventId)
  if (error) return { ok: false, error: error.message }

  await recordAuditEvent({
    action: input.featured ? 'admin.event.featured' : 'admin.event.unfeatured',
    targetType: 'event',
    targetId: input.eventId,
    metadata: { title: current.title },
    session,
  })
  return { ok: true }
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
