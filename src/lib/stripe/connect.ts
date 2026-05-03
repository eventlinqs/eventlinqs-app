import Stripe from 'stripe'

/**
 * Centralised Stripe Connect helpers.
 *
 * All organiser onboarding API routes and webhook handlers go through this
 * module so that we have one place to enforce the country whitelist, the
 * Express-only account type, and the canonical `metadata.organisation_id`
 * trail that lets us correlate Stripe accounts to EventLinqs organisations
 * later (e.g. when verifying webhook payloads).
 *
 * Test mode is configured via `STRIPE_SECRET_KEY` (already verified by
 * scripts/verify-stripe-connect-ready.ts). This module never reads any
 * other env var; callers handle URL composition.
 */

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

/**
 * Country whitelist for v1 of EventLinqs Stripe Connect.
 * Reasoning is in docs/m6/m6-implementation-plan.md (geographic scope).
 *
 * Express onboarding requires Stripe to support the country, so this list
 * is the intersection of "EventLinqs target markets" and "Stripe Connect
 * Express supported countries".
 */
export const ALLOWED_CONNECT_COUNTRIES = [
  // Anglosphere primaries
  'AU',
  'GB',
  'US',
  'NZ',
  'CA',
  'IE',
  // EU member states supported by Stripe Connect Express
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const

export type AllowedConnectCountry = (typeof ALLOWED_CONNECT_COUNTRIES)[number]

export type AccountLinkType = 'onboarding' | 'update'

export type CreateExpressAccountInput = {
  organisationId: string
  country: string
  email: string
}

export type CreateAccountLinkInput = {
  accountId: string
  organisationId: string
  type: AccountLinkType
  refreshUrl: string
  returnUrl: string
}

let cachedClient: Stripe | null = null

/**
 * Returns a memoised Stripe client. Throws synchronously if the secret
 * key is missing so misconfiguration surfaces at the first server call
 * instead of after a partial mutation.
 */
function getStripe(): Stripe {
  if (cachedClient) return cachedClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  cachedClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return cachedClient
}

/**
 * Type guard for the v1 country whitelist. Use this before calling
 * `createExpressAccount`. Anywhere the code branches on the result the
 * narrowed type is `AllowedConnectCountry`.
 */
export function isAllowedConnectCountry(value: string): value is AllowedConnectCountry {
  return (ALLOWED_CONNECT_COUNTRIES as readonly string[]).includes(value)
}

/**
 * Creates a Stripe Express connected account for an organiser.
 *
 * - Forces `type: 'express'` so the organiser goes through Stripe-hosted
 *   KYC. Standard or Custom accounts require us to host KYC ourselves.
 * - Requests the `card_payments` and `transfers` capabilities up front.
 *   These are the ones destination charges need; everything else can be
 *   added after launch.
 * - Stamps `metadata.organisation_id` so webhook handlers can correlate
 *   the Stripe account back to an EventLinqs organisation without a DB
 *   round-trip when needed for diagnostics.
 *
 * @throws when the country is outside the v1 whitelist. Caller surfaces
 * a 400 with a clear message.
 */
export async function createExpressAccount(
  input: CreateExpressAccountInput
): Promise<Stripe.Account> {
  if (!isAllowedConnectCountry(input.country)) {
    throw new Error(
      `Country "${input.country}" is not supported for Stripe Connect onboarding in v1. ` +
        `Supported countries: ${ALLOWED_CONNECT_COUNTRIES.join(', ')}.`
    )
  }

  const stripe = getStripe()
  return stripe.accounts.create({
    type: 'express',
    country: input.country,
    email: input.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      organisation_id: input.organisationId,
      eventlinqs_phase: 'm6_phase2',
    },
  })
}

/**
 * Generates a Stripe-hosted AccountLink so the organiser can complete
 * KYC ('onboarding') or update existing details ('update').
 *
 * AccountLinks are single-use and short-lived (Stripe expires them in
 * minutes), so we mint one per click rather than persisting them. The
 * `refreshUrl` callback regenerates a fresh link on expiry; the
 * `returnUrl` callback handles the post-onboarding success/pending flow.
 */
export async function createAccountLink(
  input: CreateAccountLinkInput
): Promise<Stripe.AccountLink> {
  const stripe = getStripe()
  return stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: input.type === 'onboarding' ? 'account_onboarding' : 'account_update',
    collection_options: {
      fields: 'currently_due',
    },
  })
}

/**
 * Retrieves the full Stripe Account record. Used by:
 *
 * 1. The /api/stripe/connect/return route (post-onboarding sync).
 * 2. The dashboard onboarding card (live status check).
 *
 * Returned object includes `capabilities`, `requirements`, and
 * `external_accounts`. Callers project the bits they need.
 */
export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  const stripe = getStripe()
  return stripe.accounts.retrieve(accountId)
}

/**
 * Boolean projection of "this account can accept payments AND receive
 * payouts AND has finished KYC". Used by:
 *
 * - the publish-gate (paid events blocked until this is true)
 * - the dashboard onboarding card (state = complete)
 * - the account.updated webhook (tier_1 promotion trigger)
 */
export function isFullyOnboarded(account: Stripe.Account): boolean {
  return Boolean(
    account.charges_enabled && account.payouts_enabled && account.details_submitted
  )
}

/**
 * Generates a single-use Stripe Express dashboard login link for the
 * connected account. Callers pass it to `window.location.href` (or render
 * an anchor with `rel="noopener noreferrer"` and `target="_blank"`) - the
 * link is short-lived (Stripe expires within minutes).
 *
 * Used by the M6 Phase 4 Payouts dashboard "Open Stripe Dashboard" button.
 */
export async function createDashboardLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  const stripe = getStripe()
  return stripe.accounts.createLoginLink(accountId)
}
