/**
 * The lockout that took an UPDATE against production to clear, made impossible.
 *
 * THE INCIDENT. Organisation 8baf2eaa-c592-41b7-a303-3df92b2eaa77 held
 * stripe_charges_enabled false, stripe_payouts_enabled false and payout_status
 * 'restricted' while Stripe reported the account fully enabled, capabilities
 * transfers=active and card_payments=active, zero errors, zero past_due, bank
 * account attached. Publish was refused with "Resolve the Stripe issue" when there
 * was no Stripe issue, and no screen offered a way out.
 *
 * ROOT CAUSE, found by reading every write path. handleConnectAccountUpdated wrote
 * six columns on account.updated and NEVER payout_status; the deauthorize handler
 * DID write it, setting 'restricted'. payout_status was a one-way door: anything
 * could restrict, no Stripe event could release.
 *
 * These tests pin the three things that together make the lockout unreachable:
 *   1. the reconciler derives payout_status from Stripe, so the door swings back
 *   2. the publish gate reconciles BEFORE refusing, so a stale column cannot
 *      produce a false refusal
 *   3. disconnect writes every derived column together, so a half-cleared row is
 *      unreachable
 */
import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  outstandingFrom,
  payoutStatusFor,
  connectStateFrom,
  DISCONNECTED_STATE,
} from '@/lib/stripe/reconcile-connect'
import { checkPublishGate, describeOutstanding } from '@/lib/events/publish-gate'

/** The founder's account as Stripe actually reported it. */
const healthyAccount = {
  id: 'acct_founder',
  object: 'account',
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true,
  country: 'AU',
  capabilities: { transfers: 'active', card_payments: 'active' },
  requirements: {
    currently_due: [],
    past_due: [],
    eventually_due: [],
    pending_verification: [],
    errors: [],
    disabled_reason: null,
  },
  external_accounts: { data: [{ id: 'ba_123', object: 'bank_account' }] },
} as unknown as Stripe.Account

const blockedAccount = {
  id: 'acct_blocked',
  object: 'account',
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: true,
  country: 'AU',
  capabilities: {},
  requirements: {
    currently_due: ['company.tax_id', 'company.verification.document'],
    past_due: ['company.verification.document'],
    eventually_due: ['company.tax_id', 'company.address.city'],
    pending_verification: [],
    errors: [
      {
        requirement: 'company.verification.document',
        code: 'failed_name_match',
        reason: "The company name on the account couldn't be verified. Either update your business name or upload a document containing the business name.",
      },
    ],
    disabled_reason: 'requirements.past_due',
  },
  external_accounts: { data: [] },
} as unknown as Stripe.Account

describe('the reconciler derives payout_status from Stripe, closing the one-way door', () => {
  it('a fully enabled account yields active, not restricted', () => {
    // THE REGRESSION TEST for the founder's exact state.
    expect(payoutStatusFor(healthyAccount)).toBe('active')
    expect(connectStateFrom(healthyAccount).payout_status).toBe('active')
  })

  it('an account with payouts off yields restricted', () => {
    expect(payoutStatusFor(blockedAccount)).toBe('restricted')
  })

  it('mirrors every derived column from the account, including the bank destination', () => {
    const s = connectStateFrom(healthyAccount)
    expect(s.stripe_charges_enabled).toBe(true)
    expect(s.stripe_payouts_enabled).toBe(true)
    expect(s.stripe_onboarding_complete).toBe(true)
    expect(s.stripe_account_country).toBe('AU')
    expect(s.payout_destination).toBe('ba_123')
    expect(s.stripe_capabilities).toEqual({ transfers: 'active', card_payments: 'active' })
  })

  it('writes payout_status at all, which is the column the webhook forgot', () => {
    // If payout_status ever leaves this object, the one-way door is back.
    expect(Object.keys(connectStateFrom(healthyAccount))).toContain('payout_status')
  })
})

describe('outstanding requirements are read from Stripe, most urgent first', () => {
  const out = outstandingFrom(blockedAccount)

  it('puts past_due first, because that is what stops you selling today', () => {
    expect(out[0]!.requirement).toBe('company.verification.document')
    expect(out[0]!.bucket).toBe('past_due')
  })

  it('never lists a requirement twice, since past_due is a subset of currently_due', () => {
    const names = out.map((o) => o.requirement)
    expect(new Set(names).size).toBe(names.length)
  })

  it("carries Stripe's own plain language reason verbatim", () => {
    expect(out[0]!.reason).toContain("couldn't be verified")
  })

  it('is empty for a healthy account, so no refusal can claim a requirement', () => {
    expect(outstandingFrom(healthyAccount)).toEqual([])
  })
})

describe('the refusal message names what is actually outstanding', () => {
  it("uses Stripe's error reason rather than telling you to find the problem", () => {
    const msg = describeOutstanding(outstandingFrom(blockedAccount), 'requirements.past_due')
    expect(msg).toContain("couldn't be verified")
    expect(msg).not.toMatch(/resolve the stripe issue/i)
  })

  it('names the requirement keys when Stripe gives no error reason', () => {
    const msg = describeOutstanding(
      [{ requirement: 'external_account', reason: null, bucket: 'currently_due' }],
      null,
    )
    expect(msg).toContain('external_account')
  })

  it('says nothing is needed when Stripe is merely verifying', () => {
    const msg = describeOutstanding([], 'requirements.pending_verification')
    expect(msg).toMatch(/nothing is needed/i)
  })

  it('does not invent a requirement when Stripe reports none', () => {
    const msg = describeOutstanding([], null)
    expect(msg).not.toMatch(/needs:/i)
    expect(msg).toMatch(/has not said what is outstanding/i)
  })
})

/** Minimal thenable Supabase stub, matching the shape the gate uses. */
/**
 * The publish gate now reads the SAME five columns as the sale gate
 * (ORG_SALE_FIELDS_SELECT) and runs the same predicate, so a fixture row must carry
 * all five. It used to supply three, which made every test here implicitly assert the
 * old two-check fast path; once the gate started verifying field PRESENCE those rows
 * became "incomplete" and eight tests failed. That is the incomplete-row class the
 * gate-fields-complete guard exists to catch, met in a fixture rather than in
 * production.
 *
 * Defaults are the fully sellable baseline so each test overrides only the column it
 * is actually about, which keeps the intent of each case readable.
 */
const SELLABLE_DEFAULTS = {
  stripe_account_id: 'acct_default',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_account_country: 'AU',
  payout_status: 'active',
}

function orgClient(row: Record<string, unknown> | null) {
  const full = row === null ? null : { ...SELLABLE_DEFAULTS, ...row }
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: full, error: null }) }),
      }),
    }),
  } as never
}

describe('the publish gate reconciles BEFORE refusing', () => {
  const paid = { organisationId: 'org_1', tiersHavePaid: true, coverImageUrl: 'https://x/y.jpg' }

  it('does NOT refuse on a stale restricted column when Stripe says it can sell', async () => {
    // THE EXACT LOCKOUT. Stored columns say no; Stripe says yes.
    const reconcile = vi.fn(async () => ({
      ok: true as const,
      changed: true,
      canSell: true,
      payoutStatus: 'active' as const,
      outstanding: [],
      disabledReason: null,
      adminHoldPreserved: false,
    }))

    const res = await checkPublishGate(
      orgClient({ stripe_charges_enabled: false, payout_status: 'restricted', stripe_account_id: 'acct_founder' }),
      paid,
      reconcile,
    )

    expect(reconcile, 'the gate must ask Stripe before refusing').toHaveBeenCalledWith('org_1')
    expect(res.ok, 'a false refusal is exactly the lockout').toBe(true)
  })

  it('makes NO Stripe call when the stored state already permits selling', async () => {
    // The working path must not be slowed down by this fix.
    const reconcile = vi.fn()
    const res = await checkPublishGate(
      orgClient({ stripe_charges_enabled: true, payout_status: 'active', stripe_account_id: 'acct_x' }),
      paid,
      reconcile as never,
    )
    expect(res.ok).toBe(true)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('still refuses when Stripe genuinely blocks, and says what Stripe wants', async () => {
    const reconcile = vi.fn(async () => ({
      ok: true as const,
      changed: false,
      canSell: false,
      payoutStatus: 'restricted' as const,
      outstanding: outstandingFrom(blockedAccount),
      disabledReason: 'requirements.past_due',
      adminHoldPreserved: false,
    }))
    const res = await checkPublishGate(
      orgClient({ stripe_charges_enabled: false, payout_status: 'restricted', stripe_account_id: 'acct_blocked' }),
      paid,
      reconcile,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.message).toContain("couldn't be verified")
    expect(res.outstanding?.length).toBeGreaterThan(0)
    expect(res.nextAction?.href).toBe('/dashboard/payouts')
  })

  it('does not assert a Stripe problem when Stripe was simply unreachable', async () => {
    const reconcile = vi.fn(async () => ({
      ok: false as const,
      reason: 'stripe_error' as const,
      message: 'unreachable',
    }))
    const res = await checkPublishGate(
      orgClient({ stripe_charges_enabled: false, payout_status: 'restricted', stripe_account_id: 'acct_x' }),
      paid,
      reconcile,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.message).toMatch(/could not check your Stripe status/i)
    expect(res.message).toMatch(/nothing is wrong with your account/i)
  })

  it('distinguishes an EventLinqs hold from a Stripe restriction', async () => {
    const reconcile = vi.fn(async () => ({
      ok: true as const,
      changed: false,
      canSell: false,
      payoutStatus: 'on_hold' as const,
      outstanding: [],
      disabledReason: null,
      adminHoldPreserved: true,
    }))
    const res = await checkPublishGate(
      orgClient({ stripe_charges_enabled: true, payout_status: 'restricted', stripe_account_id: 'acct_x' }),
      paid,
      reconcile,
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.message).toMatch(/by EventLinqs, not by Stripe/i)
  })

  it('a free event never reaches the payout check at all', async () => {
    const reconcile = vi.fn()
    const res = await checkPublishGate(
      orgClient(null),
      { organisationId: 'org_1', tiersHavePaid: false, coverImageUrl: 'https://x/y.jpg' },
      reconcile as never,
    )
    expect(res.ok).toBe(true)
    expect(reconcile).not.toHaveBeenCalled()
  })
})

describe('disconnect is atomic: a half-cleared row is unreachable', () => {
  it('resets every derived column together', () => {
    // The founder found a row with a null stripe_account_id still carrying the
    // payout status, capabilities, requirements and bank account id. Every one of
    // those must be in this object or that row is reachable again.
    expect(DISCONNECTED_STATE).toEqual({
      stripe_account_id: null,
      stripe_onboarding_complete: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_country: null,
      stripe_capabilities: {},
      stripe_requirements: {},
      payout_destination: null,
      payout_status: 'unset',
    })
  })

  it("does NOT call a disconnected organisation 'restricted'", () => {
    // Calling it restricted is what produced a refusal about a Stripe problem that
    // did not exist, on an account that no longer existed.
    expect(DISCONNECTED_STATE.payout_status).not.toBe('restricted')
    expect(DISCONNECTED_STATE.payout_status).toBe('unset')
  })
})

describe('reconcile never reports a state it failed to write', () => {
  /**
   * THE DEPLOY-ORDER HAZARD THIS PINS. DISCONNECTED_STATE writes
   * payout_status = 'unset', and the CHECK constraint on that column does not permit
   * 'unset' until migration 20260809000001 is applied. Proven against the TEST
   * database on 2026-08-09 with scripts/verify/payout-status-domain.mjs:
   *
   *     'active'      accepted
   *     'on_hold'     accepted
   *     'restricted'  accepted
   *     'unset'       REJECTED  23514 new row for relation "organisations"
   *                             violates check constraint
   *                             "organisations_payout_status_check"
   *
   * So if the code ships before the migration is applied, the repair write fails.
   * The branch used to return `ok: true, payoutStatus: 'unset'` regardless, so the
   * payouts page would tell the organiser no Stripe account was connected while the
   * publish gate kept refusing on the stale 'restricted' still in the database.
   * That is the founder's stranding, rebuilt out of an optimistic return value.
   */
  function clientWhereUpdateFails(row: Record<string, unknown>) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        update: () => ({
          eq: async () => ({
            error: {
              code: '23514',
              message:
                'new row for relation "organisations" violates check constraint "organisations_payout_status_check"',
            },
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  const halfClearedRow = {
    id: 'org-half',
    stripe_account_id: null,
    stripe_onboarding_complete: true,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: false,
    stripe_account_country: 'AU',
    stripe_capabilities: {},
    stripe_requirements: {},
    payout_destination: 'ba_123',
    payout_status: 'restricted',
  }

  it('reports a failure when the repair of a half-cleared row cannot be written', async () => {
    const { reconcileConnectedAccount } = await import('@/lib/stripe/reconcile-connect')
    const result = await reconcileConnectedAccount(clientWhereUpdateFails(halfClearedRow), 'org-half')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('Nothing was changed')
    expect(result.message).toContain('20260809000001')
  })

  it('still succeeds, writing nothing, when a disconnected row is already clean', async () => {
    // "There was nothing to do" and "I tried and could not" must not share a return
    // value. They did, and the caller reported both as a clean 'unset'.
    const cleanRow = {
      ...halfClearedRow,
      stripe_onboarding_complete: false,
      stripe_charges_enabled: false,
      stripe_account_country: null,
      payout_destination: null,
      payout_status: 'unset',
    }
    const { reconcileConnectedAccount } = await import('@/lib/stripe/reconcile-connect')
    const result = await reconcileConnectedAccount(clientWhereUpdateFails(cleanRow), 'org-half')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
    expect(result.payoutStatus).toBe('unset')
  })
})
