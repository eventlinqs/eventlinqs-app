import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveAccount, isFullyOnboarded } from './connect'

/**
 * The ONE place that decides what the platform believes about a connected
 * account, and the ONE place that clears it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INCIDENT THIS EXISTS TO MAKE IMPOSSIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Organisation 8baf2eaa-c592-41b7-a303-3df92b2eaa77 reached a state where Stripe
 * reported the account fully enabled, capabilities transfers=active and
 * card_payments=active, zero errors and zero past_due, with a bank account
 * attached, while the platform held stripe_charges_enabled false,
 * stripe_payouts_enabled false and payout_status 'restricted'. Publish was
 * refused with "Resolve the Stripe issue" when there was no Stripe issue, and it
 * took an UPDATE against production to release it.
 *
 * ROOT CAUSE, found by reading every write path rather than by guessing.
 * `handleConnectAccountUpdated` in src/lib/stripe/connect-handlers.ts writes six
 * columns on `account.updated`:
 *
 *     stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country,
 *     stripe_capabilities, stripe_requirements, stripe_onboarding_complete
 *
 * It does NOT write `payout_status`. The deauthorize handler
 * (src/app/api/webhooks/stripe/route.ts) DOES write it, setting 'restricted'.
 *
 * So `payout_status` was a one-way door. Anything could set it to 'restricted';
 * no incoming Stripe event could ever clear it. Once set, the organisation was
 * permanently unable to publish a paid event no matter what Stripe said, and no
 * screen offered a way back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A RECONCILER AND NOT JUST A BUG FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Adding `payout_status` to the webhook payload fixes this instance and leaves the
 * class alive, because it keeps a webhook as the single source of truth for
 * whether an organiser can sell. A webhook is an at-least-once delivery that can
 * also be a never-delivered: an endpoint not subscribed to `account.updated`, a
 * signing secret rotated mid-flight, a 500 during a deploy, an event that arrived
 * before the row existed. Every one of those turns into a permanent lie about
 * somebody's livelihood.
 *
 * Stripe's own guidance is to treat the API as the authority and the webhook as a
 * prompt. It instructs platforms to check `requirements.currently_due` on the
 * Account object immediately after creation and to keep watching `account.updated`
 * to know when to look again
 * (https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).
 *
 * So this module reads the account FROM STRIPE and writes what Stripe actually
 * says. The webhook becomes one of four triggers rather than the source of truth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does not touch a single charge, payout, fee or refund. It writes only the six
 * derived Stripe-state columns plus `payout_status`. It never reads or writes
 * `orders`, `payments`, `payouts`, `pricing_rules`, `organiser_balance_ledger` or
 * any amount. The funds-holding engine is untouched by design: this is a
 * state-mirroring module, not a money module.
 *
 * It also never sets `payout_status` to 'on_hold' and never clears one. 'on_hold'
 * is an ADMIN decision recorded by src/lib/admin/organisers.ts, and Stripe knows
 * nothing about it. A reconcile that overwrote an admin hold with Stripe's opinion
 * would silently release a deliberately withheld organisation, so an existing
 * 'on_hold' is preserved and reported.
 */

/** The four states `payout_status` may hold after migration 20260809000001. */
export type PayoutStatus = 'active' | 'on_hold' | 'restricted' | 'unset'

/** Every column this module owns. Nothing outside this list is ever written. */
export type ConnectStateColumns = {
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  stripe_account_country: string | null
  stripe_capabilities: Record<string, unknown>
  stripe_requirements: Record<string, unknown>
  payout_destination: string | null
  payout_status: PayoutStatus
}

export type OutstandingRequirement = {
  /** The Stripe requirement key, for example `company.tax_id`. */
  requirement: string
  /**
   * Stripe's own plain language explanation, taken from requirements.errors when
   * present. Stripe documents `errors[].reason` as "A plain language message that
   * explains why the error occurred and how to resolve it", which is why this is
   * shown to the organiser verbatim rather than reworded into our own guess.
   */
  reason: string | null
  /** Which array it came from, so the UI can rank past_due above eventually_due. */
  bucket: 'past_due' | 'currently_due' | 'pending_verification' | 'eventually_due'
}

export type ReconcileOutcome =
  | {
      ok: true
      /** True when a column actually changed, so callers can avoid needless writes. */
      changed: boolean
      /** Whether the organisation may sell right now, per Stripe. */
      canSell: boolean
      payoutStatus: PayoutStatus
      /** Empty when Stripe is asking for nothing. */
      outstanding: OutstandingRequirement[]
      /** Stripe's machine-readable reason a capability is off, when it gives one. */
      disabledReason: string | null
      /** True when an admin hold was found and preserved rather than overwritten. */
      adminHoldPreserved: boolean
    }
  | { ok: false; reason: 'no_account' | 'org_not_found' | 'stripe_error'; message: string }

/**
 * Pull the outstanding requirements out of a Stripe Account.
 *
 * Ordered past_due, then currently_due, then pending_verification, then
 * eventually_due, because that is the order in which they matter to somebody who
 * cannot sell today. Stripe documents past_due as a SUBSET of currently_due, so a
 * requirement is attributed to the most urgent bucket it appears in and never
 * listed twice.
 */
export function outstandingFrom(account: Stripe.Account): OutstandingRequirement[] {
  const req = account.requirements
  if (!req) return []

  const errorFor = new Map<string, string>()
  for (const e of req.errors ?? []) {
    if (e.requirement) errorFor.set(e.requirement, e.reason ?? '')
  }

  const seen = new Set<string>()
  const out: OutstandingRequirement[] = []
  const buckets: Array<[OutstandingRequirement['bucket'], string[] | null | undefined]> = [
    ['past_due', req.past_due],
    ['currently_due', req.currently_due],
    ['pending_verification', req.pending_verification],
    ['eventually_due', req.eventually_due],
  ]

  for (const [bucket, list] of buckets) {
    for (const requirement of list ?? []) {
      if (seen.has(requirement)) continue
      seen.add(requirement)
      out.push({ requirement, reason: errorFor.get(requirement) ?? null, bucket })
    }
  }
  return out
}

/**
 * The payout status Stripe's view of the account implies.
 *
 * Only ever 'active' or 'restricted'. 'on_hold' is an admin decision this module
 * must not make, and 'unset' means there is no account, which is the disconnect
 * path's business rather than reconcile's.
 */
export function payoutStatusFor(account: Stripe.Account): 'active' | 'restricted' {
  return account.payouts_enabled ? 'active' : 'restricted'
}

/**
 * The complete column set implied by a Stripe Account. Pure, so it can be tested
 * exhaustively without a Stripe or a database.
 */
export function connectStateFrom(account: Stripe.Account): Omit<ConnectStateColumns, 'payout_status'> & {
  payout_status: 'active' | 'restricted'
} {
  const external = account.external_accounts?.data?.[0]
  return {
    stripe_account_id: account.id,
    stripe_onboarding_complete: isFullyOnboarded(account),
    stripe_charges_enabled: Boolean(account.charges_enabled),
    stripe_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_account_country: account.country ?? null,
    stripe_capabilities: (account.capabilities ?? {}) as Record<string, unknown>,
    stripe_requirements: (account.requirements ?? {}) as unknown as Record<string, unknown>,
    payout_destination: external && 'id' in external ? external.id : null,
    payout_status: payoutStatusFor(account),
  }
}

/**
 * Read the connected account from Stripe and write the truth to the row.
 *
 * Safe to call on every request path: it is a single Stripe GET plus at most one
 * UPDATE, and it skips the UPDATE when nothing changed.
 *
 * `client` must be a service-role client. Reconcile is called from paths where the
 * caller has already been authorised for this organisation (the payouts page, the
 * publish gate, the onboarding return, the cron), and it writes columns the
 * organiser must never write directly.
 */
export async function reconcileConnectedAccount(
  client: SupabaseClient,
  organisationId: string,
): Promise<ReconcileOutcome> {
  const { data: org, error } = await client
    .from('organisations')
    .select(
      'id, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, stripe_capabilities, stripe_requirements, payout_destination, payout_status',
    )
    .eq('id', organisationId)
    .maybeSingle()

  if (error || !org) {
    return { ok: false, reason: 'org_not_found', message: 'Organisation not found.' }
  }

  if (!org.stripe_account_id) {
    // No account to reconcile against. This is a legitimate state, not an error:
    // the organisation has not connected Stripe, or has disconnected. Repair any
    // leftovers from a partial clear so the row cannot lie in the other direction.
    const repair = await repairDisconnectedRow(client, organisationId, org)

    // NEVER REPORT A STATE THAT WAS NOT WRITTEN. This branch used to return
    // payoutStatus 'unset' unconditionally, whether or not the repair had actually
    // landed. That is not a hypothetical: `payout_status = 'unset'` is rejected by
    // the CHECK constraint until migration 20260809000001 is applied, proven
    // against TEST on 2026-08-09 with error 23514, "new row for relation
    // organisations violates check constraint organisations_payout_status_check"
    // (scripts/verify/payout-status-domain.mjs). Deploy the code before the
    // migration and the write fails while the caller is told 'unset', so the
    // payouts page would say "no Stripe account connected" while the publish gate
    // kept refusing on the stale 'restricted' underneath. That is the founder's
    // stranding rebuilt out of an optimistic return value, so it reports the
    // failure instead.
    if (!repair.ok) {
      return {
        ok: false,
        reason: 'stripe_error',
        message:
          'Could not save the refreshed status for this organisation. Nothing was changed. Tell support: the payout status column may need migration 20260809000001.',
      }
    }

    return {
      ok: true,
      changed: repair.changed,
      canSell: false,
      payoutStatus: 'unset',
      outstanding: [],
      disabledReason: null,
      adminHoldPreserved: false,
    }
  }

  let account: Stripe.Account
  try {
    account = await retrieveAccount(org.stripe_account_id)
  } catch (err) {
    // A Stripe outage must not change what we believe. Report and leave the row
    // alone: a stale row that is honestly stale beats a row rewritten from an
    // error.
    console.error('[reconcile-connect] retrieveAccount failed', {
      organisationId,
      accountId: org.stripe_account_id,
      err,
    })
    return {
      ok: false,
      reason: 'stripe_error',
      message: 'Could not reach Stripe just now. Nothing was changed. Try again in a moment.',
    }
  }

  const next = connectStateFrom(account)
  const outstanding = outstandingFrom(account)
  const disabledReason = account.requirements?.disabled_reason ?? null

  // An admin hold outranks Stripe's opinion and is never overwritten here.
  const adminHoldPreserved = org.payout_status === 'on_hold'
  const payoutStatus: PayoutStatus = adminHoldPreserved ? 'on_hold' : next.payout_status

  const payload: Record<string, unknown> = {
    stripe_onboarding_complete: next.stripe_onboarding_complete,
    stripe_charges_enabled: next.stripe_charges_enabled,
    stripe_payouts_enabled: next.stripe_payouts_enabled,
    stripe_account_country: next.stripe_account_country,
    stripe_capabilities: next.stripe_capabilities,
    stripe_requirements: next.stripe_requirements,
    payout_status: payoutStatus,
  }
  // Only overwrite the bank destination when Stripe reports one. A transient
  // response without external_accounts expanded must not erase a known account.
  if (next.payout_destination) payload.payout_destination = next.payout_destination

  const changed = Object.keys(payload).some((k) => {
    const before = (org as Record<string, unknown>)[k]
    const after = payload[k]
    if (typeof before === 'object' || typeof after === 'object') {
      return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)
    }
    return before !== after
  })

  if (changed) {
    payload.updated_at = new Date().toISOString()
    const { error: updateError } = await client
      .from('organisations')
      .update(payload)
      .eq('id', organisationId)
    if (updateError) {
      console.error('[reconcile-connect] update failed', { organisationId, updateError })
      return {
        ok: false,
        reason: 'stripe_error',
        message: 'Could not save the refreshed Stripe status. Try again in a moment.',
      }
    }
  }

  return {
    ok: true,
    changed,
    // Selling needs charges enabled AND a payout status that is not withheld.
    canSell: next.stripe_charges_enabled && payoutStatus !== 'restricted' && payoutStatus !== 'on_hold',
    payoutStatus,
    outstanding,
    disabledReason,
    adminHoldPreserved,
  }
}

/**
 * Every derived column a disconnected organisation must hold, together.
 *
 * THE HALF-CLEARED ROW THIS PREVENTS. The founder found a row whose
 * `stripe_account_id` was null while `payout_status`, the capabilities JSON, the
 * requirements JSON and the bank account id were all left behind. The payouts page
 * then refused him by reading the stale status BEFORE it ever reached Stripe, so
 * there was no way to correct it from the browser.
 *
 * Exported as a constant rather than inlined so that every disconnect path writes
 * the identical set, and a test can assert the set is complete against the column
 * list.
 */
export const DISCONNECTED_STATE: ConnectStateColumns = {
  stripe_account_id: null,
  stripe_onboarding_complete: false,
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  stripe_account_country: null,
  stripe_capabilities: {},
  stripe_requirements: {},
  payout_destination: null,
  // NOT 'restricted'. A disconnected organisation has no Stripe status at all, and
  // calling that 'restricted' is what produced a refusal message about a Stripe
  // problem that did not exist. 'unset' is added by migration 20260809000001.
  payout_status: 'unset',
}

/**
 * Disconnect an organisation from Stripe. The ONLY way to clear connect state.
 *
 * Every column in DISCONNECTED_STATE is written in ONE update, so the row moves
 * from connected to disconnected atomically and a half-cleared row is unreachable
 * through this function. An admin 'on_hold' is deliberately NOT preserved here:
 * the hold applies to an account that no longer exists, and preserving it would
 * strand the organisation again on reconnect.
 */
export async function disconnectConnectedAccount(
  client: SupabaseClient,
  organisationId: string,
  cause: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from('organisations')
    .update({ ...DISCONNECTED_STATE, updated_at: new Date().toISOString() })
    .eq('id', organisationId)

  if (error) {
    console.error('[reconcile-connect] disconnect failed', { organisationId, cause, error })
    return { ok: false, error: 'Could not disconnect the Stripe account.' }
  }
  return { ok: true }
}

/**
 * Repair a row that says "no account" while still carrying connect state.
 *
 * Called from reconcile when `stripe_account_id` is null, so the stranded
 * half-cleared row the founder hit is repaired by the same control that refreshes
 * a healthy one. Returns whether anything needed changing.
 */
async function repairDisconnectedRow(
  client: SupabaseClient,
  organisationId: string,
  org: Record<string, unknown>,
): Promise<{ ok: boolean; changed: boolean }> {
  const stale =
    org.stripe_onboarding_complete === true ||
    org.stripe_charges_enabled === true ||
    org.stripe_payouts_enabled === true ||
    org.payout_destination !== null ||
    org.stripe_account_country !== null ||
    org.payout_status !== 'unset' ||
    JSON.stringify(org.stripe_capabilities ?? {}) !== '{}' ||
    JSON.stringify(org.stripe_requirements ?? {}) !== '{}'

  // Nothing to repair is a success, not a failure. Distinguishing the two is the
  // whole point: "there was nothing to do" and "I tried and could not" used to
  // return the same `false`, and the caller reported both as a clean 'unset'.
  if (!stale) return { ok: true, changed: false }

  const { error } = await client
    .from('organisations')
    .update({ ...DISCONNECTED_STATE, updated_at: new Date().toISOString() })
    .eq('id', organisationId)
  if (error) {
    console.error('[reconcile-connect] repair of a half-cleared row failed', {
      organisationId,
      code: (error as { code?: string }).code,
      error,
    })
    return { ok: false, changed: false }
  }
  console.warn('[reconcile-connect] repaired a half-cleared disconnected row', { organisationId })
  return { ok: true, changed: true }
}
