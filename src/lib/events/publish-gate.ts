import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Result of the publish-gate check.
 *
 * `ok: true` means the publish (or scheduled publish) is allowed. Any
 * other variant carries a stable `reason` token that callers can map to
 * a user-facing message and that tests can assert against without
 * matching free-form copy.
 */
export type PublishGateResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'organisation_not_found'
        | 'paid_event_charges_disabled'
        | 'organisation_payouts_restricted'
      message: string
    }

/**
 * Returns true if any tier carries a non-zero price. Accepts either the
 * cents form used in DB rows or the dollars form used in form input;
 * both treat zero as free, which is the only thing this function cares
 * about.
 */
export function hasPaidTier(tiers: Array<{ price: number }>): boolean {
  return tiers.some((t) => Number(t.price) > 0)
}

/**
 * Server-side publish-gate for events. Free events bypass; paid events
 * (any tier with price > 0) require the organising org to have an
 * onboarded Stripe Connect account with `charges_enabled` true and a
 * non-restricted payout status.
 *
 * Run this from every server action that can move an event to the
 * `published` or `scheduled` lifecycle state. Returning a typed reason
 * lets the caller respond with the correct status code and copy.
 */
export async function checkPublishGate(
  client: SupabaseClient,
  input: { organisationId: string; tiersHavePaid: boolean }
): Promise<PublishGateResult> {
  if (!input.tiersHavePaid) return { ok: true }

  const { data: org, error } = await client
    .from('organisations')
    .select('stripe_charges_enabled, payout_status')
    .eq('id', input.organisationId)
    .maybeSingle()

  if (error || !org) {
    return {
      ok: false,
      reason: 'organisation_not_found',
      message: 'Organisation not found.',
    }
  }

  if (!org.stripe_charges_enabled) {
    return {
      ok: false,
      reason: 'paid_event_charges_disabled',
      message:
        'Connect Stripe and finish identity verification before publishing paid events. Free events can be published anytime.',
    }
  }

  if (org.payout_status === 'restricted') {
    return {
      ok: false,
      reason: 'organisation_payouts_restricted',
      message:
        'Payouts are restricted on this organisation. Resolve the Stripe issue before publishing paid events.',
    }
  }

  return { ok: true }
}
