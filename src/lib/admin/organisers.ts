import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import { retrieveAccount } from '@/lib/stripe/connect'
import { captureException } from '@/lib/observability/sentry'
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
 * Suspending an organiser cascades: their live events (published or scheduled)
 * are taken off sale (-> paused) in the same action and audit-logged, so a
 * suspended account cannot keep selling. Reinstating does not auto-republish;
 * the organiser republishes what they choose.
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

/**
 * THE ADMIN COUNTERS ARE COMPUTED, NOT READ. Changed 25 August 2026.
 *
 * `organisations.total_event_count` and `organisations.total_volume_cents` are
 * running totals maintained by a read-modify-write in `connect-ledger.ts` on
 * every confirmed order. They are incremented there and, apart from
 * `reconcile_refund` touching the volume, nothing ever decrements them and
 * nothing ever recomputes them.
 *
 * DRIVEN AGAINST TEST, scripts/verify/aggregate-drift-drive.mjs, 25 August 2026:
 *
 *   total_volume_cents  confirmed order DELETED   15000 -> 15000, truth 0   DRIFTS
 *   total_event_count   the event DELETED             1 -> 1,     truth 0   DRIFTS
 *
 * That second line is exactly what the production purge did 46 times. And the
 * census over the live TEST data found 9 of 9 organisations carrying a non-zero
 * counter disagreed with their own rows, including one reading
 * total_event_count 5 against 76 real events and total_volume_cents 168687
 * against 172654 confirmed, so the stored figure was UNDER the truth as well as
 * over it.
 *
 * The fix is not a better increment. It is to stop keeping a second copy on the
 * read path: the admin surface now COUNTS the rows. This is an admin-only page
 * behind 2FA with a page size of 25, so the cost is two grouped queries and the
 * figure cannot be wrong. The columns stay because the ledger writes them; what
 * changes is that nobody is shown them any more.
 */
async function countEventsAndVolume(
  admin: ReturnType<typeof createAdminClient>,
  orgIds: string[],
): Promise<Map<string, { events: number; volumeCents: number }>> {
  const out = new Map<string, { events: number; volumeCents: number }>()
  for (const id of orgIds) out.set(id, { events: 0, volumeCents: 0 })
  if (orgIds.length === 0) return out

  const [{ data: events, error: eventError }, { data: orders, error: orderError }] = await Promise.all([
    admin.from('events').select('organisation_id').in('organisation_id', orgIds),
    admin
      .from('orders')
      .select('organisation_id, total_cents')
      .in('organisation_id', orgIds)
      .eq('status', 'confirmed'),
  ])

  // A read failure must be LOUD. Returning zeroes silently would print "0
  // events, $0 lifetime" beside a real organiser, which is a worse lie than the
  // stale counter this replaces.
  if (eventError) throw eventError
  if (orderError) throw orderError

  for (const e of events ?? []) {
    const bucket = out.get(e.organisation_id as string)
    if (bucket) bucket.events += 1
  }
  for (const o of orders ?? []) {
    const bucket = out.get(o.organisation_id as string)
    if (bucket) bucket.volumeCents += Number(o.total_cents ?? 0)
  }
  return out
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
      'id, name, slug, status, email, payout_status, stripe_charges_enabled, created_at',
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
  const counted = await countEventsAndVolume(admin, trimmed.map((r) => r.id))

  return {
    rows: trimmed.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      email: r.email,
      payoutStatus: r.payout_status,
      stripeChargesEnabled: r.stripe_charges_enabled,
      totalEventCount: counted.get(r.id)?.events ?? 0,
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

  // F5 cascade: a suspended organiser must not keep selling. Take their live
  // events off sale (published or scheduled -> paused) and audit the count.
  // Best-effort: the suspension itself has already succeeded and is recorded.
  if (input.action === 'suspend') {
    const { data: paused, error: cascadeErr } = await admin
      .from('events')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('organisation_id', input.organisationId)
      .in('status', ['published', 'scheduled'])
      .select('id')
    if (!cascadeErr && paused && paused.length > 0) {
      await recordAuditEvent({
        action: 'admin.organiser.events_unpublished',
        targetType: 'organisation',
        targetId: input.organisationId,
        metadata: { name: current.name, count: paused.length, reason: 'organiser suspended' },
        session,
      })
    }
  }

  return { ok: true }
}

export interface PayoutHoldResult {
  ok: boolean
  error?: string
}

/**
 * Places or lifts an ADMIN payout hold on an organiser by toggling
 * organisations.payout_status between 'active' and 'on_hold'. This is a status
 * gate only: it changes no charge, fee, or payout math. The disbursement
 * control already refuses to pay out unless payout_status is 'active', so a
 * hold immediately stops funds leaving while sales (and the reserve) are
 * untouched.
 *
 * A Stripe-driven 'restricted' status is NOT an admin hold and cannot be
 * cleared here; the organiser must resolve their Stripe requirements.
 */
export async function setOrganiserPayoutHold(
  input: { organisationId: string; hold: boolean; reason?: string | null },
  session: AdminSession,
): Promise<PayoutHoldResult> {
  const admin = createAdminClient()
  const { data: current, error: readErr } = await admin
    .from('organisations')
    .select('id, name, payout_status')
    .eq('id', input.organisationId)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!current) return { ok: false, error: 'Organisation not found' }

  if (current.payout_status === 'restricted') {
    return {
      ok: false,
      error: 'Payouts are restricted by Stripe verification, not an admin hold. Resolve the Stripe requirements first.',
    }
  }

  const target = input.hold ? 'on_hold' : 'active'
  if (current.payout_status === target) return { ok: true }

  const reason = input.reason?.trim() || null
  const { error: updErr } = await admin
    .from('organisations')
    .update({ payout_status: target, updated_at: new Date().toISOString() })
    .eq('id', input.organisationId)
  if (updErr) return { ok: false, error: updErr.message }

  await recordAuditEvent({
    action: input.hold ? 'admin.organiser.payout_held' : 'admin.organiser.payout_released',
    targetType: 'organisation',
    targetId: input.organisationId,
    metadata: { name: current.name, oldStatus: current.payout_status, newStatus: target, reason },
    session,
  })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Organiser detail + Stripe Connect verification (KYC for a Connect platform).
// EventLinqs has no custom KYC schema by design: identity verification is the
// connected account's, so "verification" is read straight from Stripe. No
// invented columns.
// ---------------------------------------------------------------------------

export interface VerificationView {
  hasAccount: boolean
  onboarded: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  disabledReason: string | null
  /** Set when the live Stripe lookup failed; the page still renders. */
  lookupError: boolean
}

/** Pure mapper: a Stripe account (or null) -> the verification view. */
export function summariseVerification(account: Stripe.Account | null, lookupError = false): VerificationView {
  if (!account) {
    return {
      hasAccount: false, onboarded: false, chargesEnabled: false, payoutsEnabled: false,
      detailsSubmitted: false, requirementsDue: [], disabledReason: null, lookupError,
    }
  }
  const req = account.requirements
  return {
    hasAccount: true,
    onboarded: Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted),
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDue: req?.currently_due ?? [],
    disabledReason: req?.disabled_reason ?? null,
    lookupError: false,
  }
}

export interface AdminOrganiserDetail {
  id: string
  name: string
  slug: string
  status: OrgStatus
  email: string | null
  payoutStatus: string
  totalEventCount: number
  totalVolumeCents: number
  stripeAccountId: string | null
  createdAt: string
  availableActions: OrganiserAction[]
  verification: VerificationView
}

export async function getOrganiserDetail(orgId: string): Promise<AdminOrganiserDetail | null> {
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('id, name, slug, status, email, payout_status, stripe_account_id, created_at')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return null

  // Live Stripe verification. Read-only; never let a Stripe error break the page.
  let verification: VerificationView
  if (org.stripe_account_id) {
    try {
      const account = await retrieveAccount(org.stripe_account_id)
      verification = summariseVerification(account)
    } catch (err) {
      captureException(err, { scope: 'admin-organisers', handler: 'retrieve-account', organisation_id: orgId })
      verification = summariseVerification(null, true)
    }
  } else {
    verification = summariseVerification(null)
  }

  const counted = await countEventsAndVolume(admin, [org.id])

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    email: org.email,
    payoutStatus: org.payout_status,
    totalEventCount: counted.get(org.id)?.events ?? 0,
    totalVolumeCents: counted.get(org.id)?.volumeCents ?? 0,
    stripeAccountId: org.stripe_account_id ?? null,
    createdAt: org.created_at,
    availableActions: actionsForStatus(org.status),
    verification,
  }
}
