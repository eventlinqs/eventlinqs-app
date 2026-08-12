import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Handles Stripe `account.updated` events for Connect Express accounts.
 *
 * Mirrors live Stripe -> stripe-cli -> /api/webhooks/stripe -> signature
 * verify -> here. Idempotent on the natural key `stripe_account_id` so
 * Stripe re-deliveries are safe.
 *
 * Tier promotion fires exactly once on the first transition into the
 * fully-onboarded state (charges_enabled && payouts_enabled &&
 * details_submitted). The tier_progression_log insert with
 * reason='auto_promotion' is the audit signal external systems rely on.
 */
export async function handleConnectAccountUpdated(
  account: Stripe.Account,
  eventId: string
): Promise<void> {
  const adminClient = createAdminClient()

  const fullyOnboarded = Boolean(
    account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted
  )

  const { data: prevOrg, error: selectError } = await adminClient
    .from('organisations')
    .select('id, stripe_onboarding_complete, payout_tier, payout_destination, payout_status')
    .eq('stripe_account_id', account.id)
    .maybeSingle()
  if (selectError) {
    console.error('[m6] account.updated select failed', {
      eventId,
      accountId: account.id,
      selectError,
    })
  }

  const externalAccount = account.external_accounts?.data?.[0]
  const payoutDestination =
    externalAccount && 'id' in externalAccount ? externalAccount.id : null

  // THE BUG THIS LINE FIXES, and it locked the founder out of his own platform.
  //
  // This payload wrote six columns and NEVER payout_status. The deauthorize handler
  // DOES write it, setting 'restricted'. So payout_status was a one-way door:
  // anything could restrict an organisation and no incoming Stripe event could ever
  // release it. Stripe reported the account fully enabled while the platform held
  // payout_status 'restricted', the publish gate refused with "Resolve the Stripe
  // issue", and it took an UPDATE against production to clear.
  //
  // payout_status now mirrors Stripe's payouts_enabled like every other column
  // here, EXCEPT that an admin 'on_hold' is preserved: that is an EventLinqs
  // decision Stripe knows nothing about, and overwriting it with Stripe's opinion
  // would silently release a deliberately withheld organisation.
  //
  // The reconciler (src/lib/stripe/reconcile-connect.ts) is the authority and can
  // rebuild this state from Stripe at any time, so a missed account.updated is now
  // recoverable rather than permanent.
  const adminHold = prevOrg?.payout_status === 'on_hold'

  const updatePayload: Record<string, unknown> = {
    stripe_charges_enabled: account.charges_enabled ?? false,
    stripe_payouts_enabled: account.payouts_enabled ?? false,
    stripe_account_country: account.country ?? null,
    stripe_capabilities: (account.capabilities ?? {}) as Record<string, unknown>,
    stripe_requirements: (account.requirements ?? {}) as unknown as Record<
      string,
      unknown
    >,
    stripe_onboarding_complete: fullyOnboarded,
    payout_status: adminHold ? 'on_hold' : account.payouts_enabled ? 'active' : 'restricted',
    updated_at: new Date().toISOString(),
  }
  if (payoutDestination) {
    updatePayload.payout_destination = payoutDestination
  }

  const { error: updateError } = await adminClient
    .from('organisations')
    .update(updatePayload)
    .eq('stripe_account_id', account.id)

  if (updateError) {
    console.error('[m6] account.updated update failed', {
      eventId,
      accountId: account.id,
      error: updateError,
    })
    return
  }

  const wasIncomplete = !prevOrg?.stripe_onboarding_complete
  const tierIsTier1 = prevOrg?.payout_tier === 'tier_1'
  if (fullyOnboarded && wasIncomplete && prevOrg?.id) {
    if (!tierIsTier1) {
      const { error: tierError } = await adminClient
        .from('organisations')
        .update({
          payout_tier: 'tier_1',
          updated_at: new Date().toISOString(),
        })
        .eq('id', prevOrg.id)
      if (tierError) {
        console.error('[m6] account.updated tier promotion failed', {
          eventId,
          orgId: prevOrg.id,
          error: tierError,
        })
      }
    }
    const { error: logError } = await adminClient
      .from('tier_progression_log')
      .insert({
        organisation_id: prevOrg.id,
        from_tier: prevOrg?.payout_tier ?? 'tier_1',
        to_tier: 'tier_1',
        reason: 'auto_promotion',
        triggered_by: null,
        metadata: {
          webhook_event_id: eventId,
          stripe_account_id: account.id,
        },
      })
    if (logError) {
      console.error('[m6] account.updated tier log insert failed', {
        eventId,
        orgId: prevOrg.id,
        error: logError,
      })
    }
  }
}
