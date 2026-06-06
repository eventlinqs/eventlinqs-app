import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/payments/payout'

/**
 * Generates a single-use Stripe Express dashboard login link for a connected
 * account. Callers open it in a new tab (rel="noopener noreferrer") - the link
 * is short-lived (Stripe expires it within minutes).
 *
 * Used by the M6 Phase 4 Payouts dashboard "Open Stripe Dashboard" button.
 * Lives in the payouts module (not src/lib/stripe, which Session 1 owns) and
 * reuses the canonical, cached Stripe client exported by the payments layer so
 * there is a single Stripe API-version source of truth.
 */
export async function createDashboardLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  const stripe = getStripeClient()
  return stripe.accounts.createLoginLink(accountId)
}
