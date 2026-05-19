/**
 * Webhook event-level dedupe + retry signalling (P2-6, P2-2).
 *
 * Stripe redelivers events on retry and, rarely, can deliver the same event
 * more than once concurrently. Per-resource idempotency (payment status
 * guards, ledger existing-row checks) is defence in depth but there is no
 * single chokepoint that says "this exact Stripe event is already fully
 * processed, do nothing". Once the webhook returns non-2xx on a failed
 * `confirm_order` (so Stripe retries the money path), a clean event-level
 * dedupe becomes load-bearing.
 *
 * Backing table: `public.processed_webhook_events`, drafted in
 * `supabase/migrations/20260520000002_webhook_dedupe.sql` (DRAFT - the
 * founder applies migrations via `supabase db push --linked`).
 *
 * Lifecycle is claim-first so it is correct under concurrent redelivery, not
 * just sequential retry:
 *   1. claimWebhookEvent: insert-or-read. Fresh insert or a prior
 *      received/failed row -> we own processing ('claimed'). An existing
 *      'processed' row -> 'duplicate' (no-op).
 *   2. process the event.
 *   3. markWebhookEventProcessed on success / markWebhookEventFailed on
 *      failure. A 'failed' row does not block a later retry (it re-claims);
 *      it is an audit breadcrumb and a metric source.
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const TABLE = 'processed_webhook_events'

/**
 * Thrown by money-path handlers to signal "this delivery failed in a way
 * Stripe should retry". The webhook POST maps this to HTTP 500 so Stripe
 * redelivers on its normal backoff. Used for `confirm_order` failure,
 * `transition_payment_status` failure, and a missing payment row (a race the
 * next delivery should re-enter). It is NOT used for post-gate side-effect
 * faults: those are captured and swallowed because re-running the whole
 * webhook to retry a cache refresh would resend the confirmation email.
 */
export class WebhookProcessingError extends Error {
  readonly context?: Record<string, unknown>
  readonly cause?: unknown
  constructor(message: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message)
    this.name = 'WebhookProcessingError'
    this.cause = options?.cause
    this.context = options?.context
  }
}

export type WebhookClaimOutcome = 'claimed' | 'duplicate'

export interface WebhookClaimResult {
  outcome: WebhookClaimOutcome
  attempts: number
}

interface ProcessedWebhookRow {
  event_id: string
  status: 'received' | 'processed' | 'failed'
  attempts: number
}

/**
 * Atomically claim an event for processing.
 *
 * Uses an `INSERT ... ON CONFLICT DO NOTHING` (supabase-js upsert with
 * `ignoreDuplicates`) so a concurrent redelivery cannot both win the claim.
 * If the claim insert returns no row (conflict), the existing row is read
 * back: a `processed` row is a true duplicate; a `received`/`failed` row is
 * a crashed or in-flight or failed prior delivery that we re-process (all
 * money-path handlers are idempotent), bumping `attempts`.
 *
 * Fails open: if the dedupe table is unreachable the event is still
 * processed (returns 'claimed'). Correctness then falls back to the
 * per-resource idempotency that already exists. A dedupe-table outage must
 * not drop a real payment confirmation.
 */
export async function claimWebhookEvent(
  adminClient: AdminClient,
  eventId: string,
  eventType: string
): Promise<WebhookClaimResult> {
  const { data: inserted, error: insertError } = await adminClient
    .from(TABLE)
    .upsert(
      { event_id: eventId, event_type: eventType, status: 'received' },
      { onConflict: 'event_id', ignoreDuplicates: true }
    )
    .select('event_id, status, attempts')

  if (insertError) {
    console.error('[webhook-dedupe] claim insert failed, failing open', {
      eventId,
      error: insertError,
    })
    return { outcome: 'claimed', attempts: 1 }
  }

  const insertedRow = (inserted as ProcessedWebhookRow[] | null)?.[0]
  if (insertedRow) {
    // Won the claim with a fresh insert.
    return { outcome: 'claimed', attempts: insertedRow.attempts }
  }

  // Conflict: a row already exists. Read it back to decide.
  const { data: existing, error: readError } = await adminClient
    .from(TABLE)
    .select('event_id, status, attempts')
    .eq('event_id', eventId)
    .maybeSingle()

  if (readError || !existing) {
    console.error('[webhook-dedupe] existing-row read failed, failing open', {
      eventId,
      error: readError,
    })
    return { outcome: 'claimed', attempts: 1 }
  }

  const row = existing as ProcessedWebhookRow
  if (row.status === 'processed') {
    return { outcome: 'duplicate', attempts: row.attempts }
  }

  // received | failed -> re-claim and re-process (idempotent handlers).
  const nextAttempts = row.attempts + 1
  const { error: bumpError } = await adminClient
    .from(TABLE)
    .update({ status: 'received', attempts: nextAttempts })
    .eq('event_id', eventId)
  if (bumpError) {
    console.error('[webhook-dedupe] attempt bump failed (non-fatal)', {
      eventId,
      error: bumpError,
    })
  }
  return { outcome: 'claimed', attempts: nextAttempts }
}

export async function markWebhookEventProcessed(
  adminClient: AdminClient,
  eventId: string
): Promise<void> {
  const { error } = await adminClient
    .from(TABLE)
    .update({ status: 'processed', processed_at: new Date().toISOString(), last_error: null })
    .eq('event_id', eventId)
  if (error) {
    // Non-fatal: the event was processed correctly; only the audit marker
    // failed. A later redelivery re-processes (idempotent) rather than being
    // a true no-op, which is acceptable and self-healing.
    console.error('[webhook-dedupe] mark processed failed (non-fatal)', { eventId, error })
  }
}

export async function markWebhookEventFailed(
  adminClient: AdminClient,
  eventId: string,
  failure: unknown
): Promise<void> {
  const message = failure instanceof Error ? failure.message : String(failure)
  const { error } = await adminClient
    .from(TABLE)
    .update({ status: 'failed', last_error: message.slice(0, 2000) })
    .eq('event_id', eventId)
  if (error) {
    console.error('[webhook-dedupe] mark failed failed (non-fatal)', { eventId, error })
  }
}
