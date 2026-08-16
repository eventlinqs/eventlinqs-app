/**
 * The divergence guard: it must catch the founder's lockout, and it must not cry
 * wolf, because a gate that is always red is a gate somebody switches off.
 *
 * THE FAULT IT HUNTS. Organisation 8baf2eaa-c592-41b7-a303-3df92b2eaa77 held
 * payout_status 'restricted', stripe_charges_enabled false and
 * stripe_payouts_enabled false while Stripe reported the account fully enabled with
 * transfers=active and card_payments=active. Nothing on the platform noticed for as
 * long as it lasted. These tests assert one run would have named it.
 *
 * THE TRAP IT MUST AVOID. The hourly reconcile repairs drift. If this guard also
 * repaired, a dead `account.updated` webhook would be patched every hour forever and
 * nobody would learn the webhook was dead. So the guard reports and never writes,
 * and the read-only contract is asserted here rather than only described in a
 * comment.
 */
import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  compareToStripe,
  halfClearedFields,
  describeDivergence,
  scanConnectDivergence,
  BLOCKING_FIELDS,
  INFORMATIONAL_FIELDS,
} from '@/lib/stripe/connect-divergence'

const retrieveAccount = vi.hoisted(() => vi.fn())
vi.mock('@/lib/stripe/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe/connect')>()),
  retrieveAccount,
}))

/** Stripe's own view of the founder's account: entirely healthy. */
const healthy = {
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

/** The row as the platform actually held it during the lockout. */
const strandedRow = {
  id: 'org-founder',
  name: 'The founder',
  stripe_account_id: 'acct_founder',
  stripe_onboarding_complete: false,
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  stripe_account_country: 'AU',
  stripe_capabilities: { transfers: 'active', card_payments: 'active' },
  stripe_requirements: {
    currently_due: [],
    past_due: [],
    eventually_due: [],
    pending_verification: [],
    errors: [],
    disabled_reason: null,
  },
  payout_destination: 'ba_123',
  payout_status: 'restricted',
}

/** The same organisation once the reconciler has written the truth. */
const agreeingRow = {
  ...strandedRow,
  stripe_onboarding_complete: true,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  payout_status: 'active',
}

describe('compareToStripe: the lockout is named', () => {
  it('reports the founder-stranding row as BLOCKING, field by field', () => {
    const { divergences, blocking } = compareToStripe(strandedRow, healthy)
    expect(blocking).toBe(true)
    const fields = divergences.filter((d) => d.blocking).map((d) => d.field).sort()
    expect(fields).toEqual([
      'payout_status',
      'stripe_charges_enabled',
      'stripe_onboarding_complete',
      'stripe_payouts_enabled',
    ])
    const status = divergences.find((d) => d.field === 'payout_status')
    expect(status?.platform).toBe('restricted')
    expect(status?.stripe).toBe('active')
  })

  it('finds nothing at all once the platform and Stripe agree', () => {
    const { divergences, blocking } = compareToStripe(agreeingRow, healthy)
    expect(divergences).toEqual([])
    expect(blocking).toBe(false)
  })
})

describe('compareToStripe: what must NOT be called divergence', () => {
  it('an admin hold on a healthy Stripe account is correct, not a fault', () => {
    // 'on_hold' is an EventLinqs decision Stripe knows nothing about. The reconciler
    // preserves it on purpose; reporting that preservation as a defect would flag
    // every deliberately held organisation forever.
    const held = { ...agreeingRow, payout_status: 'on_hold' }
    const { divergences, blocking, adminHold } = compareToStripe(held, healthy)
    expect(adminHold).toBe(true)
    expect(blocking).toBe(false)
    expect(divergences).toEqual([])
  })

  it('an admin hold does NOT mask a genuine capability divergence underneath it', () => {
    // The hold excuses payout_status and nothing else. If Stripe says charges are on
    // and the row says off, that is still a real fault on a held organisation.
    const held = { ...agreeingRow, payout_status: 'on_hold', stripe_charges_enabled: false }
    const { divergences, blocking } = compareToStripe(held, healthy)
    expect(blocking).toBe(true)
    expect(divergences.map((d) => d.field)).toContain('stripe_charges_enabled')
    expect(divergences.map((d) => d.field)).not.toContain('payout_status')
  })

  it('a stored bank destination against an absent one is the reconciler rule, not drift', () => {
    // reconcileConnectedAccount only overwrites payout_destination when Stripe
    // reports one, so a response without external_accounts expanded must not read as
    // a disagreement here either.
    const noExternal = { ...healthy, external_accounts: { data: [] } } as unknown as Stripe.Account
    const { divergences } = compareToStripe(agreeingRow, noExternal)
    expect(divergences.map((d) => d.field)).not.toContain('payout_destination')
  })

  it('a churned requirements payload is reported but never blocking', () => {
    const stale = {
      ...agreeingRow,
      stripe_requirements: { ...agreeingRow.stripe_requirements, current_deadline: 123 },
    }
    const { divergences, blocking } = compareToStripe(stale, healthy)
    expect(blocking).toBe(false)
    expect(divergences).toHaveLength(1)
    expect(divergences[0].field).toBe('stripe_requirements')
    expect(divergences[0].blocking).toBe(false)
  })
})

describe('the severity split is exhaustive and disjoint', () => {
  it('every field the reconciler owns is classified exactly once', () => {
    // If a new column joins the reconciler and nobody classifies it, it is silently
    // unwatched. This is the test that fails when that happens.
    const reconcilerOwned = [
      'stripe_onboarding_complete',
      'stripe_charges_enabled',
      'stripe_payouts_enabled',
      'stripe_account_country',
      'stripe_capabilities',
      'stripe_requirements',
      'payout_destination',
      'payout_status',
    ].sort()
    const classified = [...BLOCKING_FIELDS, ...INFORMATIONAL_FIELDS].sort()
    expect(classified).toEqual(reconcilerOwned)
    expect(new Set(classified).size).toBe(classified.length)
  })
})

describe('halfClearedFields: a row that contradicts itself', () => {
  it('names live state carried by a row with no Stripe account', () => {
    expect(
      halfClearedFields({
        stripe_charges_enabled: true,
        stripe_payouts_enabled: false,
        stripe_onboarding_complete: true,
        payout_destination: 'ba_123',
      }),
    ).toEqual([
      'stripe_charges_enabled=true',
      'stripe_onboarding_complete=true',
      'payout_destination=ba_123',
    ])
  })

  it('does NOT flag payout_status alone, because the column cannot hold unset yet', () => {
    // Proven against TEST on 2026-08-09: writing 'unset' raises 23514 on
    // organisations_payout_status_check until migration 20260809000001 is applied
    // (scripts/verify/payout-status-domain.mjs). Flagging it would put every
    // disconnected organisation in the report for a pending migration rather than a
    // lie.
    expect(
      halfClearedFields({
        payout_status: 'restricted',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_onboarding_complete: false,
        payout_destination: null,
      }),
    ).toEqual([])
  })
})

describe('scanConnectDivergence: the read-only contract', () => {
  function clientFor(rows: Array<Record<string, unknown>>, spy: { updates: number }) {
    return {
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
        update: () => {
          spy.updates++
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('writes NOTHING, even when it finds the worst possible divergence', async () => {
    retrieveAccount.mockResolvedValue(healthy)
    const spy = { updates: 0 }
    const report = await scanConnectDivergence(clientFor([strandedRow], spy))
    expect(report.blocking).toHaveLength(1)
    expect(spy.updates).toBe(0)
  })

  it('separates blocking, stale, half-cleared and unreachable', async () => {
    const spy = { updates: 0 }
    const halfCleared = {
      id: 'org-half',
      name: 'Half cleared',
      stripe_account_id: null,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: false,
      stripe_onboarding_complete: false,
      payout_destination: null,
      payout_status: 'restricted',
    }
    const staleRow = {
      ...agreeingRow,
      id: 'org-stale',
      name: 'Stale',
      stripe_account_id: 'acct_stale',
      stripe_account_country: 'NZ',
    }
    const unreachableRow = {
      ...agreeingRow,
      id: 'org-unreachable',
      name: 'Unreachable',
      stripe_account_id: 'acct_gone',
    }

    retrieveAccount.mockImplementation(async (id: string) => {
      if (id === 'acct_gone') throw new Error('No such account')
      return healthy
    })

    const report = await scanConnectDivergence(
      clientFor([strandedRow, staleRow, unreachableRow, halfCleared], spy),
    )

    expect(report.checked).toBe(3) // the half-cleared row needs no Stripe call
    expect(report.blocking.map((v) => v.organisationId)).toEqual(['org-founder'])
    expect(report.informational.map((v) => v.organisationId)).toEqual(['org-stale'])
    expect(report.unreachable.map((v) => v.organisationId)).toEqual(['org-unreachable'])
    expect(report.halfCleared.map((v) => v.organisationId)).toEqual(['org-half'])
    expect(spy.updates).toBe(0)
  })

  it('an unreachable Stripe is never counted as agreement', async () => {
    // "I could not ask" is not "they agree". Folding it into a pass is how a broken
    // Stripe key looks green.
    retrieveAccount.mockRejectedValue(new Error('connection reset'))
    const spy = { updates: 0 }
    const report = await scanConnectDivergence(clientFor([strandedRow], spy))
    expect(report.blocking).toHaveLength(0)
    expect(report.unreachable).toHaveLength(1)
    expect(report.unreachable[0].unreachable).toContain('connection reset')
  })
})

describe('describeDivergence', () => {
  it('states the platform value and the Stripe value on one line each', () => {
    retrieveAccount.mockResolvedValue(healthy)
    const { divergences, blocking, adminHold } = compareToStripe(strandedRow, healthy)
    const text = describeDivergence({
      checked: 1,
      blocking: [
        {
          organisationId: 'org-founder',
          organisationName: 'The founder',
          stripeAccountId: 'acct_founder',
          divergences,
          blocking,
          adminHold,
        },
      ],
      informational: [],
      unreachable: [],
      halfCleared: [],
    })
    expect(text).toContain('BLOCKING')
    expect(text).toContain('payout_status: platform says restricted, Stripe says active')
  })
})
