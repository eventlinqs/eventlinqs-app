import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import type { AdminSession } from '@/lib/admin/types'
import type { Database } from '@/types/database'

/**
 * M7 organiser moderation (scope 3.4 / 3.6).
 *
 * Reads the organisations table and transitions organisations.status through
 * the org_status lifecycle. Every transition is audit-logged old -> new with
 * an optional reason that is also stored in the organisation metadata so the
 * organiser-facing surfaces can later explain the state.
 *
 * Transitions are gated: an action only applies from its allowed source
 * states (e.g. you cannot suspend a pending organisation - you reject it).
 * This keeps the lifecycle honest and the audit trail meaningful.
 *
 * Status cascade (unpublishing a suspended org's live events) is intentionally
 * out of scope here; that lands with the moderation queue work. This module
 * only owns the organisations.status column.
 */

type OrgStatus = Database['public']['Enums']['org_status']

export type OrganiserAction = 'approve' | 'reject' | 'suspend' | 'reinstate'

interface ActionSpec {
  from: readonly OrgStatus[]
  to: OrgStatus
  auditAction: string
}

const ACTION_SPECS: Record<OrganiserAction, ActionSpec> = {
  approve: { from: ['pending'], to: 'active', auditAction: 'admin.organiser.approved' },
  reject: { from: ['pending'], to: 'deactivated', auditAction: 'admin.organiser.rejected' },
  suspend: { from: ['active'], to: 'suspended', auditAction: 'admin.organiser.suspended' },
  reinstate: { from: ['suspended', 'deactivated'], to: 'active', auditAction: 'admin.organiser.reinstated' },
}

export const ORGANISER_ACTION_LABELS: Record<OrganiserAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  suspend: 'Suspend',
  reinstate: 'Reinstate',
}

/** Actions available from a given current status (drives the row buttons). */
export function actionsForStatus(status: OrgStatus): OrganiserAction[] {
  return (Object.keys(ACTION_SPECS) as OrganiserAction[]).filter((a) =>
    ACTION_SPECS[a].from.includes(status),
  )
}

export interface AdminOrganiserRow {
  id: string
  name: string
  slug: string
  status: OrgStatus
  email: string | null
  payoutStatus: string
  stripeChargesEnabled: boolean
  totalEventCount: number
  createdAt: string
}

export const ORGANISER_STATUS_FILTERS: readonly (OrgStatus | 'all')[] = [
  'all',
  'pending',
  'active',
  'suspended',
  'deactivated',
]

export interface OrganiserListFilters {
  status?: OrgStatus | 'all'
  search?: string
  page?: number
}

export interface OrganiserListResult {
  rows: AdminOrganiserRow[]
  page: number
  pageSize: number
  hasMore: boolean
}

const PAGE_SIZE = 25

export async function listOrganisations(filters: OrganiserListFilters): Promise<OrganiserListResult> {
  const admin = createAdminClient()
  const page = Math.max(filters.page ?? 1, 1)
  const fromIdx = (page - 1) * PAGE_SIZE

  let q = admin
    .from('organisations')
    .select(
      'id, name, slug, status, email, payout_status, stripe_charges_enabled, total_event_count, created_at',
    )
    .order('created_at', { ascending: false })
    .range(fromIdx, fromIdx + PAGE_SIZE) // fetch one extra to detect hasMore

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.search) {
    const term = `%${filters.search}%`
    q = q.or(`name.ilike.${term},slug.ilike.${term},email.ilike.${term}`)
  }

  const { data, error } = await q
  if (error) throw error

  const raw = data ?? []
  const hasMore = raw.length > PAGE_SIZE
  const trimmed = hasMore ? raw.slice(0, PAGE_SIZE) : raw

  return {
    rows: trimmed.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      email: r.email,
      payoutStatus: r.payout_status,
      stripeChargesEnabled: r.stripe_charges_enabled,
      totalEventCount: r.total_event_count,
      createdAt: r.created_at,
    })),
    page,
    pageSize: PAGE_SIZE,
    hasMore,
  }
}

export interface OrganiserActionResult {
  ok: boolean
  error?: string
  /** Set when the org was not in an allowed source state for this action. */
  invalidTransition?: boolean
}

/**
 * Applies a lifecycle action to one organisation, guarded by the allowed
 * source states, then audit-logs old -> new. The status update is conditional
 * on the row still being in an allowed source state (a status filter on the
 * update), so a concurrent change cannot be clobbered.
 */
export async function applyOrganiserAction(
  input: { organisationId: string; action: OrganiserAction; reason?: string },
  session: AdminSession,
): Promise<OrganiserActionResult> {
  const admin = createAdminClient()
  const spec = ACTION_SPECS[input.action]

  const { data: current, error: readErr } = await admin
    .from('organisations')
    .select('id, name, status, metadata')
    .eq('id', input.organisationId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!current) return { ok: false, error: 'Organisation not found' }
  if (!spec.from.includes(current.status)) return { ok: false, invalidTransition: true }

  const reason = input.reason?.trim() || null
  const existingMeta = (current.metadata && typeof current.metadata === 'object' ? current.metadata : {}) as Record<
    string,
    unknown
  >
  const moderation = {
    status: spec.to,
    reason,
    actedBy: session.email,
    actedAt: new Date().toISOString(),
  }

  const { data: updated, error: updErr } = await admin
    .from('organisations')
    .update({
      status: spec.to,
      metadata: { ...existingMeta, last_moderation: moderation },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organisationId)
    .in('status', spec.from as unknown as string[])
    .select('id')
    .maybeSingle()
  if (updErr) return { ok: false, error: updErr.message }
  if (!updated) return { ok: false, invalidTransition: true }

  await recordAuditEvent({
    action: spec.auditAction,
    targetType: 'organisation',
    targetId: input.organisationId,
    metadata: {
      name: current.name,
      oldStatus: current.status,
      newStatus: spec.to,
      reason,
    },
    session,
  })

  return { ok: true }
}
