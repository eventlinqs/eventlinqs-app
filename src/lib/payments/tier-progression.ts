import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tier 1 → Tier 2 progression scaffolding for the M6 tiered payouts
 * model.
 *
 * Phase 2 deliverable: build the helpers a future post-event hook (cron
 * job, payout.paid webhook, or event lifecycle transition to
 * `completed`) can call to record event completions and evaluate
 * eligibility. Phase 2 deliberately does not auto-promote organisers to
 * Tier 2. Admin approval is required (deferred to M7), so this module
 * only flags eligibility on `organisations.metadata.tier_2_eligible`.
 *
 * Reasoning:
 *   - One bad early event can put the organiser on hold. We need a
 *     human gate before relaxing the post-event-only payout schedule.
 *   - The flag is a hint, not a contract; the admin panel reads it but
 *     the actual `payout_tier` change happens through the existing
 *     audit-logged path.
 *
 * Eligibility rules (kept simple for v1):
 *   - Currently on `tier_1`.
 *   - At least one completed event tracked in `total_event_count`.
 *   - Zero chargeback or chargeback_fee entries on the
 *     `organiser_balance_ledger`.
 */

export type RecordEventCompletionInput = {
  organisationId: string
  /**
   * Gross ticket revenue for the event in the smallest currency unit
   * (e.g. cents for AUD/USD, kobo for NGN). Negative values are
   * rejected.
   */
  grossVolumeCents: number
  eventId: string
}

export type Tier2EligibilityResult = {
  eligible: boolean
  reason:
    | 'eligible'
    | 'org_not_found'
    | 'not_tier_1'
    | 'no_completed_events'
    | 'chargebacks_present'
}

export type RecordEventCompletionResult = {
  ok: boolean
  totalEventCount: number
  totalVolumeCents: number
  eligibility: Tier2EligibilityResult
  error?: string
}

/**
 * Increments lifetime counters on an organisation after one of its
 * events completes successfully (no outstanding refunds or
 * chargebacks at the time of call), then evaluates Tier 2 eligibility
 * and persists the flag if applicable.
 *
 * Caller is responsible for idempotency. The natural caller is a
 * once-per-event cron job that joins on `events.status = 'completed'`
 * and a "processed" timestamp it owns; an alternative caller is the
 * `payout.paid` webhook for the first payout against a given event.
 */
export async function recordEventCompletion(
  admin: SupabaseClient,
  input: RecordEventCompletionInput
): Promise<RecordEventCompletionResult> {
  if (input.grossVolumeCents < 0) {
    return {
      ok: false,
      totalEventCount: 0,
      totalVolumeCents: 0,
      eligibility: { eligible: false, reason: 'org_not_found' },
      error: 'grossVolumeCents must be non-negative',
    }
  }

  const { data: org, error: readError } = await admin
    .from('organisations')
    .select('id, payout_tier, total_event_count, total_volume_cents, metadata')
    .eq('id', input.organisationId)
    .maybeSingle()

  if (readError || !org) {
    return {
      ok: false,
      totalEventCount: 0,
      totalVolumeCents: 0,
      eligibility: { eligible: false, reason: 'org_not_found' },
      error: readError?.message ?? 'organisation_not_found',
    }
  }

  const newCount = (org.total_event_count ?? 0) + 1
  const newVolume = (org.total_volume_cents ?? 0) + input.grossVolumeCents

  const { error: updateError } = await admin
    .from('organisations')
    .update({
      total_event_count: newCount,
      total_volume_cents: newVolume,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.organisationId)

  if (updateError) {
    return {
      ok: false,
      totalEventCount: org.total_event_count ?? 0,
      totalVolumeCents: org.total_volume_cents ?? 0,
      eligibility: { eligible: false, reason: 'org_not_found' },
      error: updateError.message,
    }
  }

  const eligibility = await evaluateTier2Eligibility(admin, input.organisationId)
  if (eligibility.eligible) {
    await markTier2Eligible(admin, input.organisationId, org.metadata)
  }

  return {
    ok: true,
    totalEventCount: newCount,
    totalVolumeCents: newVolume,
    eligibility,
  }
}

/**
 * Pure read. Returns Tier 2 eligibility for an organisation without
 * mutating anything. Used by the admin panel (M7) to surface the queue
 * of organisers awaiting promotion review.
 */
export async function evaluateTier2Eligibility(
  client: SupabaseClient,
  organisationId: string
): Promise<Tier2EligibilityResult> {
  const { data: org, error } = await client
    .from('organisations')
    .select('payout_tier, total_event_count')
    .eq('id', organisationId)
    .maybeSingle()

  if (error || !org) return { eligible: false, reason: 'org_not_found' }
  if (org.payout_tier !== 'tier_1') return { eligible: false, reason: 'not_tier_1' }
  if ((org.total_event_count ?? 0) < 1) {
    return { eligible: false, reason: 'no_completed_events' }
  }

  const { count: chargebackCount, error: ledgerError } = await client
    .from('organiser_balance_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .in('entry_type', ['chargeback', 'chargeback_fee'])

  if (ledgerError) {
    return { eligible: false, reason: 'org_not_found' }
  }
  if ((chargebackCount ?? 0) > 0) {
    return { eligible: false, reason: 'chargebacks_present' }
  }

  return { eligible: true, reason: 'eligible' }
}

async function markTier2Eligible(
  admin: SupabaseClient,
  organisationId: string,
  currentMetadata: Record<string, unknown> | null
): Promise<void> {
  const metadata = currentMetadata ?? {}
  if (metadata.tier_2_eligible === true) return

  const next = {
    ...metadata,
    tier_2_eligible: true,
    tier_2_eligible_at: new Date().toISOString(),
  }

  await admin
    .from('organisations')
    .update({ metadata: next, updated_at: new Date().toISOString() })
    .eq('id', organisationId)
}
