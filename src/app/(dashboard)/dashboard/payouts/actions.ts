'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { reconcileConnectedAccount } from '@/lib/stripe/reconcile-connect'
import type { OutstandingRequirement } from '@/lib/stripe/reconcile-connect'

export type RefreshStripeStatusResult =
  | {
      ok: true
      changed: boolean
      canSell: boolean
      payoutStatus: string
      outstanding: OutstandingRequirement[]
      message: string
    }
  | { ok: false; error: string }

/**
 * "Refresh Stripe status": the control that lets a stranded organiser recover in
 * the browser, with no founder and no SQL.
 *
 * THE ACCEPTANCE TEST THIS EXISTS FOR. Organisation
 * 8baf2eaa-c592-41b7-a303-3df92b2eaa77 held payout_status 'restricted' while Stripe
 * reported the account fully enabled. Publish was refused for a Stripe problem that
 * did not exist, nothing on any screen offered a way out, and it took an UPDATE
 * against production to release it. Pressing this reads the connected account from
 * Stripe and writes the truth, so the same organisation releases itself.
 *
 * AUTHORISATION. resolveOrganiserScope verifies the caller owns the organisation it
 * names and returns 403 for one that belongs to somebody else, so passing another
 * owner's id cannot reconcile, or read the state of, their business. The write then
 * runs with the service role because these are columns an organiser must never be
 * able to set directly: the whole point is that the platform mirrors Stripe rather
 * than accepting anybody's assertion about it.
 *
 * Nothing here touches a charge, a payout, a fee or a refund. It mirrors seven
 * derived Stripe-state columns and nothing else.
 */
export async function refreshStripeStatus(organisationId?: string): Promise<RefreshStripeStatusResult> {
  const scope = await resolveOrganiserScope(organisationId)
  if (!scope.ok) {
    return {
      ok: false,
      error:
        scope.reason === 'unauthenticated'
          ? 'Sign in to refresh your Stripe status.'
          : scope.reason === 'not_your_organisation'
            ? 'That organisation is not yours.'
            : 'Create your organisation first.',
    }
  }

  const result = await reconcileConnectedAccount(createAdminClient(), scope.org.organisationId)
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === 'stripe_error'
          ? 'Could not reach Stripe just now. Nothing was changed. Try again in a moment.'
          : 'Organisation not found.',
    }
  }

  revalidatePath('/dashboard/payouts')

  // The message is written so an organiser who was stranded learns that they are
  // not any more, and an organiser who is genuinely blocked learns exactly why.
  let message: string
  if (result.canSell) {
    message = result.changed
      ? 'Your Stripe status was out of date and has been corrected. You can publish paid events.'
      : 'Everything is up to date. You can publish paid events.'
  } else if (result.adminHoldPreserved) {
    message =
      'Payouts are on hold by EventLinqs, not by Stripe. Contact support and we will tell you exactly why.'
  } else if (result.outstanding.length > 0) {
    const withReason = result.outstanding.find((o) => o.reason)
    message = withReason?.reason
      ? `Stripe still needs this resolved: ${withReason.reason}`
      : `Stripe still needs: ${result.outstanding.slice(0, 3).map((o) => o.requirement).join(', ')}.`
  } else if (result.payoutStatus === 'unset') {
    message = 'No Stripe account is connected to this organisation yet.'
  } else {
    message =
      'Refreshed. Stripe has not enabled payouts yet and has not said what is outstanding. Open your Stripe dashboard for the detail.'
  }

  return {
    ok: true,
    changed: result.changed,
    canSell: result.canSell,
    payoutStatus: result.payoutStatus,
    outstanding: result.outstanding,
    message,
  }
}
