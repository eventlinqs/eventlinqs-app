import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOrganiserOfPaymentSetupProblem } from '@/lib/notifications/organiser-money-notify'

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
    .select('id, stripe_onboarding_complete, payout_tier, payout_destination, payout_status, stripe_charges_enabled, stripe_payouts_enabled')
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
    /*
     * MONEY FIX A3 LAYER TWO. This handler is a VERIFICATION: Stripe has just
     * told us what the account is, and these columns are being written from it.
     * Stamping it here is what keeps the publish gate's freshness rule cheap in
     * normal operation, because an account whose webhooks are arriving never
     * goes stale and never costs a publish an extra Stripe round trip.
     *
     * It follows that an account whose stamp HAS gone stale is precisely one
     * whose webhooks have stopped, which is the case the freshness rule exists
     * for.
     */
    stripe_status_verified_at: new Date().toISOString(),
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

  /*
   * MONEY FIX B4: "any payment setup problem".
   *
   * THE DEFECT THIS CLOSES. Everything above writes Stripe's new verdict into
   * the organisations row and tells nobody. An organiser whose account stopped
   * being able to take money found out when a publish was refused, or when a
   * buyer met "This organiser is still finishing their payment setup" on an
   * event they had already promoted and sold from.
   *
   * THE TRANSITION, NOT THE STATE. `account.updated` fires for changes that
   * have nothing to do with payability, and an account that has never been
   * finished is not news every time Stripe touches it. `prevOrg` is the posture
   * BEFORE this delivery, so the comparison can only fire on something that was
   * working and has stopped. That test is a pure function
   * (`hasStoppedWorking`) so it is judged on its own rather than through a
   * mailbox.
   *
   * NON-FATAL AND AFTER THE WRITE. The row is already correct at this point; a
   * mail failure must not make Stripe redeliver and must never leave the
   * posture unwritten.
   */
  if (prevOrg?.id) {
    const told = await notifyOrganiserOfPaymentSetupProblem(adminClient, {
      organisationId: String(prevOrg.id),
      before: {
        chargesEnabled: prevOrg.stripe_charges_enabled === true,
        payoutsEnabled: prevOrg.stripe_payouts_enabled === true,
      },
      after: {
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
      },
    })
    if (told.status === 'skipped' && told.reason !== 'no_change') {
      console.warn('[m6] the organiser was NOT told their payment setup had stopped working', {
        eventId,
        orgId: prevOrg.id,
        reason: told.reason,
      })
    }
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
