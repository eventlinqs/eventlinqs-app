import Stripe from 'stripe'
import type { ConnectBusinessProfile } from './business-profile'

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
  /**
   * Connected-account payout delay in days (connected balance -> organiser
   * bank). Under the funds-holding model (separate charges and transfers) the
   * connected account is EMPTY until our post-event platform->connected transfer
   * (createEventTransfer), so this daily schedule no longer front-runs the hold:
   * it only moves already-disbursed funds onward to the organiser's bank. The
   * hold is enforced platform-side by deferring the transfer to event_end +
   * buffer. Single-sourced from `payout_schedule_days` (pricing_rules).
   */
  payoutDelayDays: number
  /**
   * What the platform already knows about this organiser, prefilled into
   * Stripe's hosted onboarding so the organiser never retypes it. Built by
   * `buildConnectBusinessProfile`. See business-profile.ts for the field-by-field
   * citation and for why the merchant category code is deliberately absent.
   */
  businessProfile: ConnectBusinessProfile
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
 * - PREFILLS `business_profile` from the organisation record. Stripe:
 *   "If you've already collected information for your connected accounts, you
 *   can prefill that information when creating the account. Connect Onboarding
 *   won't ask for the prefilled information during account onboarding."
 *   (https://docs.stripe.com/api/accounts/create, fetched 2026-08-09.)
 *
 *   The prefill happens HERE, at creation, because that is the only moment it
 *   can save the organiser any typing: Stripe stops asking for a field once it
 *   is prefilled, and by the time the AccountLink opens the form the question
 *   has either been skipped or asked. Stripe also narrows what a platform may
 *   write after that point: "For accounts where
 *   controller.requirement_collection is `stripe`, which includes Standard and
 *   Express accounts, you can update all information until you create an
 *   Account Link or Account Session to start Connect onboarding, after which
 *   some properties can no longer be updated."
 *   (https://docs.stripe.com/api/accounts/update, fetched 2026-08-09.)
 *
 *   `business_profile.name` is NOT one of the properties that locks. Verified
 *   2026-08-09 against a fully-onboarded Express account on TEST
 *   (acct_1TcWaWGtNOwOpaL9, details_submitted and charges_enabled): a platform
 *   POST of business_profile[name] was accepted, and Stripe then reset that
 *   account's statement_descriptor to match. So an already-damaged account can
 *   still be repaired through the API; prefilling here is what stops it being
 *   damaged in the first place.
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
    business_profile: input.businessProfile,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    // Funds-holding model: a daily connected-account payout schedule is safe
    // because the connected balance is empty until our post-event transfer, so
    // it never front-runs the hold. See CreateExpressAccountInput.payoutDelayDays.
    settings: {
      payouts: {
        schedule: { interval: 'daily', delay_days: input.payoutDelayDays },
      },
    },
    metadata: {
      organisation_id: input.organisationId,
      eventlinqs_phase: 'm6_phase2',
    },
  })
}

/**
 * PAY-01 (interim) backfill: set the platform payout schedule on an
 * already-onboarded connected account. Run for accounts created before this
 * schedule was enforced. Same charge-relative-buffer caveat as
 * `createExpressAccount`.
 */
export async function setPlatformPayoutSchedule(
  accountId: string,
  payoutDelayDays: number,
): Promise<Stripe.Account> {
  const stripe = getStripe()
  return stripe.accounts.update(accountId, {
    settings: {
      payouts: {
        schedule: { interval: 'daily', delay_days: payoutDelayDays },
      },
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
 * The customer-facing business name currently on a connected account, or null
 * when Stripe holds none yet.
 *
 * Used by the divergence check that compares this against `organisations.name`.
 * Kept as its own thin helper so the payouts page and the health sentinel read
 * the value the same way, and so a Stripe outage degrades to "unknown" at one
 * call site rather than throwing into a page render.
 */
export async function getConnectedBusinessName(accountId: string): Promise<string | null> {
  const account = await retrieveAccount(accountId)
  return account.business_profile?.name ?? null
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
