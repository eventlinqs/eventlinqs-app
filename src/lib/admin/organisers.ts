import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
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

  /*
   * AND THE COUNT IS OF EVERY ROW, WHICH IS THE WHOLE POINT OF COUNTING THEM.
   *
   * The header above says the fix for a drifting counter was to stop keeping a
   * second copy and to COUNT THE ROWS, "so the figure cannot be wrong". Both
   * reads were unbounded, and an unbounded read cannot count rows: Supabase
   * caps one response at a fixed number, 1,000 by default
   * (https://supabase.com/docs/reference/javascript/select, fetched
   * 2026-09-19). Measured against this project on 20 September 2026:
   *
   *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
   *     no count requested     HTTP 200   Content-Range: 0-999/*
   *
   * An ordinary read is the second line: the server withholds the total and
   * answers 200 with no error, so nothing in the response says rows were left
   * out. The page size is 25 organisations, which bounds the QUESTION and not
   * the ANSWER: twenty-five organisers with forty confirmed orders each is a
   * thousand rows, and past that the lifetime volume beside a real organiser
   * simply stops growing. That is the drift this function was written to end,
   * arriving by a different route.
   *
   * Paged, ordered by id so the windows are a partition rather than a lottery,
   * and still loud on failure: `readEveryRow` throws rather than returning what
   * it managed to collect.
   */
  const [events, orders] = await Promise.all([
    readEveryRow<{ organisation_id: string }>('the admin organiser event counts', (from, to) =>
      admin
        .from('events')
        .select('organisation_id')
        .in('organisation_id', orgIds)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    readEveryRow<{ organisation_id: string; total_cents: number }>(
      'the admin organiser lifetime volume',
      (from, to) =>
        admin
          .from('orders')
          .select('organisation_id, total_cents')
          .in('organisation_id', orgIds)
          .eq('status', 'confirmed')
          .order('id', { ascending: true })
          .range(from, to),
    ),
  ])

  for (const e of events) {
    const bucket = out.get(e.organisation_id)
    if (bucket) bucket.events += 1
  }
  for (const o of orders) {
    const bucket = out.get(o.organisation_id)
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
    /*
     * THE NUMBER IS ASKED FOR, NOT INFERRED FROM THE ROWS THAT CAME BACK.
     *
     * This counted `paused.length`, the RETURNED representation of the update,
     * which is a different question from how many rows were updated. Whether
     * PostgREST's row ceiling caps that representation is UNSOURCED: its own
     * configuration page describes db-max-rows only as "a hard limit to the
     * number of rows PostgREST will fetch from a view, table, or function"
     * (https://docs.postgrest.org/en/v12/references/configuration.html, fetched
     * 2026-09-20) and says nothing about a non-GET verb.
     *
     * So the dependency is removed rather than the question answered. The
     * installed postgrest-js 2.101.1 documents `update(values, { count })` as
     * the "count algorithm to use to count UPDATED rows", with `exact`
     * performing a COUNT(*), and separately that updated rows are not returned
     * at all unless `.select()` is chained. Asking for the count and not the
     * rows is therefore both correct and cheaper, and it cannot be truncated.
     *
     * AND A CASCADE THAT FAILED NOW SAYS SO. The old `if (!cascadeErr && ...)`
     * wrote an audit entry on success and nothing at all on failure, so a
     * suspended organiser whose events stayed ON SALE left no record anywhere.
     * The suspension itself has already succeeded and is audited, so this stays
     * best-effort and does not throw; it is the SILENCE that is fixed.
     */
    const cascade = await admin
      .from('events')
      .update({ status: 'paused', updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('organisation_id', input.organisationId)
      .in('status', ['published', 'scheduled'])

    /*
     * THREE OUTCOMES, THREE RECORDS, because they are three different facts and
     * the audit log is where somebody looks to find out what happened. The
     * count is NOT coalesced: `count ?? 0` would file "nothing needed pausing"
     * and "the count was not returned" under the same entry, and the guard over
     * this file refuses it for exactly that reason. This cascade stays
     * best-effort and never throws, because the suspension itself has already
     * succeeded and is already audited.
     */
    if (cascade.error) {
      console.error('[admin/organisers] suspend cascade failed for %s:', input.organisationId, cascade.error)
      await recordAuditEvent({
        action: 'admin.organiser.events_unpublish_failed',
        targetType: 'organisation',
        targetId: input.organisationId,
        metadata: { name: current.name, error: cascade.error.message, reason: 'organiser suspended' },
        session,
      })
    } else if (cascade.count === null) {
      await recordAuditEvent({
        action: 'admin.organiser.events_unpublish_count_unknown',
        targetType: 'organisation',
        targetId: input.organisationId,
        metadata: { name: current.name, reason: 'organiser suspended' },
        session,
      })
    } else if (cascade.count > 0) {
      await recordAuditEvent({
        action: 'admin.organiser.events_unpublished',
        targetType: 'organisation',
        targetId: input.organisationId,
        metadata: { name: current.name, count: cascade.count, reason: 'organiser suspended' },
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
  // A READ THAT FAILED IS NOT AN ORGANISER WHO IS NOT THERE. This dropped
  // `error`, so a database that could not be reached returned null, and the
  // route above it renders that as "not found": the admin screen told the
  // founder that a live organisation, one he had just clicked through to, does
  // not exist. Null now means only what it says.
  const { data: org, error: orgError } = await admin
    .from('organisations')
    .select('id, name, slug, status, email, payout_status, stripe_account_id, created_at')
    .eq('id', orgId)
    .maybeSingle()
  if (orgError) {
    throw new Error(`the organiser ${orgId} could not be read: ${orgError.message}`)
  }
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
