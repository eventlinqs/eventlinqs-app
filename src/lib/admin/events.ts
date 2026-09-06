import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import { hasRealCover } from '@/lib/events/publish-gate'
import { ARCHIVED_STATUS, canArchive, restoreTarget } from '@/lib/event-lifecycle'
import { deleteEventEverywhere } from '@/lib/events/delete-event-core'
import { typedMatches } from '@/lib/events/typed-confirmation'
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
 * This module owns the events.status column for moderation and the
 * events.is_featured flag (setEventFeatured), both audit-logged.
 */

type EventStatus = Database['public']['Enums']['event_status']

/**
 * Archive and restore joined the set on 6 September 2026 (close-out C13.7):
 * the admin console gets the same delete and archive as the organiser, under
 * the same database rules. Archive is legal from every status but archived
 * (the lifecycle module decides, never a list here) and restore returns an
 * archived event to exactly the status it came from. Delete is its own path,
 * deleteEventAsAdmin, because it is not a status change.
 */
export type EventAction = 'pause' | 'resume' | 'cancel' | 'takedown' | 'archive' | 'restore'

interface ActionSpec {
  from: readonly EventStatus[]
  to: EventStatus
  auditAction: string
  requiresReason?: boolean
}

const ACTION_SPECS: Record<Exclude<EventAction, 'archive' | 'restore'>, ActionSpec> = {
  pause: { from: ['published'], to: 'paused', auditAction: 'admin.event.paused' },
  resume: { from: ['paused'], to: 'published', auditAction: 'admin.event.resumed' },
  cancel: {
    from: ['draft', 'scheduled', 'published', 'paused', 'postponed'],
    to: 'cancelled',
    auditAction: 'admin.event.cancelled',
  },
  // Admin takedown: a post-moderation removal of a live or upcoming event that
  // breaches policy. Removes it from sale (-> cancelled) and REQUIRES a reason.
  // There is no pre-publish approval gate; organisers self-serve and an admin
  // takes content down after the fact.
  takedown: {
    from: ['draft', 'scheduled', 'published', 'paused', 'postponed'],
    to: 'cancelled',
    auditAction: 'admin.event.takedown',
    requiresReason: true,
  },
}

export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  takedown: 'Take down',
  archive: 'Archive',
  restore: 'Restore',
}

/**
 * Actions available from a given current status (drives the row buttons).
 * Takedown is excluded here: it carries a mandatory reason and is surfaced via
 * its own panel on the event detail page, not the compact list rows.
 */
export function actionsForEventStatus(status: EventStatus): EventAction[] {
  const fixed = (Object.keys(ACTION_SPECS) as (keyof typeof ACTION_SPECS)[]).filter(
    (a) => a !== 'takedown' && ACTION_SPECS[a].from.includes(status),
  ) as EventAction[]
  if (canArchive(status)) fixed.push('archive')
  if (status === ARCHIVED_STATUS) fixed.push('restore')
  return fixed
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
  'archived',
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
  /** Where an archived event returns to on restore; null unless archived. */
  archivedFromStatus: EventStatus | null
  archivedAt: string | null
}

/** Full admin view of one event: core fields, organiser, and ticket tiers. */
export async function getAdminEventDetail(eventId: string): Promise<AdminEventDetail | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('events')
    .select(
      'id, title, slug, status, visibility, is_featured, is_free, fee_pass_type, organisation_id, start_date, end_date, max_capacity, venue_name, venue_city, city_primary, created_at, archived_from_status, archived_at, organisations(name)',
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
    archivedFromStatus: (data.archived_from_status as EventStatus | null) ?? null,
    archivedAt: data.archived_at ?? null,
  }
}

export type AdminDeleteResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'title_mismatch' | 'money_records' | 'not_found' | 'failed'; message: string }

/**
 * Delete from the admin console. The SAME core the organiser action uses, run
 * under the service role, so the money-records trigger is the rule here too
 * and there is no override (close-out C13.7). The typed title is the human
 * check; the trigger is the enforcement.
 */
export async function deleteEventAsAdmin(
  input: { eventId: string; typedTitle: string },
  session: AdminSession,
): Promise<AdminDeleteResult> {
  const admin = createAdminClient()
  const { data: current } = await admin.from('events').select('id, title').eq('id', input.eventId).maybeSingle()
  if (!current) return { ok: false, reason: 'not_found', message: 'Event not found' }
  if (!typedMatches(input.typedTitle, current.title)) {
    return { ok: false, reason: 'title_mismatch', message: 'The title you typed does not match the event.' }
  }
  const outcome = await deleteEventEverywhere({
    eventId: input.eventId,
    actor: { id: session.userId, email: session.email, role: session.admin.role },
    deleteWith: admin,
  })
  if (!outcome.ok) {
    const reason = outcome.reason === 'money_records' ? 'money_records' : outcome.reason === 'not_found' ? 'not_found' : 'failed'
    return { ok: false, reason, message: outcome.message }
  }
  return { ok: true, title: outcome.title }
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

  const { data: current, error: readErr } = await admin
    .from('events')
    .select('id, title, status, cover_image_url, archived_from_status')
    .eq('id', input.eventId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!current) return { ok: false, error: 'Event not found' }

  if (input.action === 'archive' || input.action === 'restore') {
    return applyArchiveOrRestore(input.action, current, session)
  }

  const spec = ACTION_SPECS[input.action]
  if (!spec.from.includes(current.status)) return { ok: false, invalidTransition: true }

  // COVER REQUIRED TO PUBLISH, on every path that reaches 'published', not only
  // the organiser one. Resume is such a path and had no cover check: the
  // validated DB constraint events_published_real_cover would still have
  // refused the write, so nothing could ever go live without a cover, but the
  // admin saw a raw Postgres constraint message instead of a sentence. This
  // says what is wrong and refuses for the same reason the constraint does.
  if (spec.to === 'published' && !hasRealCover(current.cover_image_url)) {
    return {
      ok: false,
      error:
        'This event has no cover photo, so it cannot go live. The organiser needs to upload one, or generate a designed cover, before it can be resumed.',
    }
  }

  const reason = input.reason?.trim() || null
  if (spec.requiresReason && !reason) return { ok: false, error: 'reason_required' }

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

/**
 * Archive and restore, from the console. The lifecycle module decides what is
 * legal (docs/EVENT-LIFECYCLE.md); the update is conditional on the row still
 * holding the status that was read, so a concurrent change is never clobbered;
 * and a restore to published re-checks the cover exactly as resume does, so
 * nothing goes live through the console that could not go live through the
 * organiser's publish. Audited old -> new, with the actor.
 */
async function applyArchiveOrRestore(
  action: 'archive' | 'restore',
  current: { id: string; title: string; status: EventStatus; cover_image_url: string | null; archived_from_status: EventStatus | null },
  session: AdminSession,
): Promise<EventActionResult> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (action === 'archive') {
    if (!canArchive(current.status)) return { ok: false, invalidTransition: true }
    const { data: updated, error } = await admin
      .from('events')
      .update({
        status: ARCHIVED_STATUS,
        archived_at: now,
        archived_from_status: current.status,
        archived_by: session.userId,
        updated_at: now,
      })
      .eq('id', current.id)
      .eq('status', current.status)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!updated) return { ok: false, invalidTransition: true }
    await recordAuditEvent({
      action: 'admin.event.archived',
      targetType: 'event',
      targetId: current.id,
      metadata: { title: current.title, oldStatus: current.status, newStatus: ARCHIVED_STATUS },
      session,
    })
    return { ok: true }
  }

  const target = restoreTarget(current)
  if (!target) return { ok: false, invalidTransition: true }
  if (target === 'published' && !hasRealCover(current.cover_image_url)) {
    return {
      ok: false,
      error:
        'This event has no cover photo, so it cannot return to live. Restore it to a draft by asking the organiser to upload one first.',
    }
  }
  const { data: restored, error } = await admin
    .from('events')
    .update({ status: target, archived_at: null, archived_from_status: null, archived_by: null, updated_at: now })
    .eq('id', current.id)
    .eq('status', ARCHIVED_STATUS)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!restored) return { ok: false, invalidTransition: true }
  await recordAuditEvent({
    action: 'admin.event.restored',
    targetType: 'event',
    targetId: current.id,
    metadata: { title: current.title, oldStatus: ARCHIVED_STATUS, newStatus: target },
    session,
  })
  return { ok: true }
}
