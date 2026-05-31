import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/observability/sentry', () => ({
  captureException: vi.fn(),
}))

import {
  createPayout,
  voidPayoutById,
  runReserveRelease,
  __setStripeClientForTests,
} from '@/lib/payments/payout'
import { captureException } from '@/lib/observability/sentry'

// ── Stripe stub ────────────────────────────────────────────────────────────
interface PayoutCreateCall {
  params: Stripe.PayoutCreateParams
  options?: Stripe.RequestOptions
}
interface BalanceCall {
  params?: unknown
  options?: Stripe.RequestOptions
}

interface StripeStubOpts {
  availableCents?: number
  availableCurrency?: string
  throwOnCreate?: Error
}

function buildStripe(opts: StripeStubOpts = {}) {
  const payoutCalls: PayoutCreateCall[] = []
  const balanceCalls: BalanceCall[] = []
  const stripe = {
    balance: {
      retrieve: vi.fn(async (params?: unknown, options?: Stripe.RequestOptions) => {
        balanceCalls.push({ params, options })
        return {
          available: [
            { amount: opts.availableCents ?? 1_000_000, currency: opts.availableCurrency ?? 'aud' },
          ],
          pending: [],
        } as unknown as Stripe.Balance
      }),
    },
    payouts: {
      create: vi.fn(async (params: Stripe.PayoutCreateParams, options?: Stripe.RequestOptions) => {
        payoutCalls.push({ params, options })
        if (opts.throwOnCreate) throw opts.throwOnCreate
        return {
          id: 'po_test_1',
          object: 'payout',
          amount: params.amount,
          currency: params.currency,
          status: 'in_transit',
        } as unknown as Stripe.Payout
      }),
    },
  } as unknown as Stripe
  return { stripe, payoutCalls, balanceCalls }
}

// ── Admin (service-role) Supabase client stub ────────────────────────────────
type RpcResult = { data: unknown; error: { message: string } | null }

interface AdminStubOpts {
  stripeAccountId?: string | null
  orgError?: { message: string } | null
  disburse?: RpcResult
  voidResult?: RpcResult
  release?: RpcResult
  backfillError?: { message: string } | null
}

function buildAdmin(opts: AdminStubOpts = {}) {
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = []
  const payoutUpdates: Record<string, unknown>[] = []
  const updateEqArgs: { col: string; val: unknown }[] = []

  const rpc = vi.fn(async (name: string, params: Record<string, unknown>): Promise<RpcResult> => {
    rpcCalls.push({ name, params })
    if (name === 'disburse_payout') {
      return (
        opts.disburse ?? {
          data: {
            success: true,
            payout_id: 'payout_uuid_1',
            amount_cents: 5_720,
            available_before_cents: 5_720,
            available_after_cents: 0,
          },
          error: null,
        }
      )
    }
    if (name === 'void_payout') {
      return opts.voidResult ?? { data: { success: true, reversed: true, payout_id: params.p_payout_id }, error: null }
    }
    if (name === 'release_holds') {
      return opts.release ?? { data: 3, error: null }
    }
    return { data: null, error: null }
  })

  const from = vi.fn((table: string) => {
    if (table === 'organisations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                opts.stripeAccountId === null
                  ? { stripe_account_id: null }
                  : { stripe_account_id: opts.stripeAccountId ?? 'acct_test_1' },
              error: opts.orgError ?? null,
            }),
          }),
        }),
      }
    }
    if (table === 'payouts') {
      return {
        update: (row: Record<string, unknown>) => {
          payoutUpdates.push(row)
          return {
            eq: async (col: string, val: unknown) => {
              updateEqArgs.push({ col, val })
              return { error: opts.backfillError ?? null }
            },
          }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    rpcCalls,
    payoutUpdates,
    updateEqArgs,
  }
}

const mockedCapture = vi.mocked(captureException)

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  __setStripeClientForTests(null)
  vi.clearAllMocks()
})

describe('createPayout', () => {
  test('happy path: claim -> Stripe payout on connected account (idempotencyKey=payout id) -> row back-filled to in_transit', async () => {
    const { stripe, payoutCalls, balanceCalls } = buildStripe({ availableCents: 1_000_000 })
    const admin = buildAdmin({ stripeAccountId: 'acct_org_1' })

    const result = await createPayout(admin.client, stripe, {
      organisationId: 'org_1',
      currency: 'AUD',
      actor: 'admin_user_1',
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.payoutId).toBe('payout_uuid_1')
    expect(result.stripePayoutId).toBe('po_test_1')
    expect(result.amountCents).toBe(5_720)
    expect(result.availableAfterCents).toBe(0)

    // Real connected-account balance was read for the connected account.
    expect(balanceCalls).toHaveLength(1)
    expect(balanceCalls[0].options?.stripeAccount).toBe('acct_org_1')

    // disburse_payout claim happened with the right args.
    const disburse = admin.rpcCalls.find((c) => c.name === 'disburse_payout')
    expect(disburse?.params).toMatchObject({
      p_organisation_id: 'org_1',
      p_currency: 'AUD',
      p_amount_cents: null,
      p_actor: 'admin_user_1',
    })

    // Stripe payout created ON the connected account, idempotency key = payout id.
    expect(payoutCalls).toHaveLength(1)
    expect(payoutCalls[0].params.amount).toBe(5_720)
    expect(payoutCalls[0].params.currency).toBe('aud')
    expect(payoutCalls[0].options?.stripeAccount).toBe('acct_org_1')
    expect(payoutCalls[0].options?.idempotencyKey).toBe('payout_uuid_1')

    // Row back-filled to in_transit with the Stripe payout id.
    expect(admin.payoutUpdates).toHaveLength(1)
    expect(admin.payoutUpdates[0]).toMatchObject({
      stripe_payout_id: 'po_test_1',
      status: 'in_transit',
    })
    expect(admin.updateEqArgs[0]).toEqual({ col: 'id', val: 'payout_uuid_1' })

    // No void on the happy path.
    expect(admin.rpcCalls.find((c) => c.name === 'void_payout')).toBeUndefined()
  })

  test('disburse_payout returns exceeds_available -> no Stripe payout, structured error surfaced', async () => {
    const { stripe, payoutCalls } = buildStripe()
    const admin = buildAdmin({
      disburse: {
        data: { success: false, error: 'exceeds_available', available_cents: 100, requested_cents: 999 },
        error: null,
      },
    })

    const result = await createPayout(admin.client, stripe, {
      organisationId: 'org_1',
      currency: 'AUD',
      amountCents: 999,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('exceeds_available')
    expect(payoutCalls).toHaveLength(0)
    expect(admin.rpcCalls.find((c) => c.name === 'void_payout')).toBeUndefined()
  })

  test('disburse_payout returns payouts_not_active -> no Stripe payout', async () => {
    const { stripe, payoutCalls } = buildStripe()
    const admin = buildAdmin({
      disburse: { data: { success: false, error: 'payouts_not_active', payout_status: 'on_hold' }, error: null },
    })

    const result = await createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('payouts_not_active')
    expect(payoutCalls).toHaveLength(0)
  })

  test('disburse_payout returns nothing_to_disburse -> no Stripe payout', async () => {
    const { stripe, payoutCalls } = buildStripe()
    const admin = buildAdmin({
      disburse: { data: { success: false, error: 'nothing_to_disburse', available_cents: 0 }, error: null },
    })

    const result = await createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('nothing_to_disburse')
    expect(payoutCalls).toHaveLength(0)
  })

  test('claimed amount exceeds the real Stripe balance -> void called, no payout, exceeds_stripe_balance', async () => {
    // Ledger claim succeeds for 5_720 but the connected account only has 1_000 available.
    const { stripe, payoutCalls } = buildStripe({ availableCents: 1_000 })
    const admin = buildAdmin({ stripeAccountId: 'acct_org_1' })

    const result = await createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('exceeds_stripe_balance')

    // No money moved.
    expect(payoutCalls).toHaveLength(0)
    // The ledger claim was compensated via void_payout.
    const voidCall = admin.rpcCalls.find((c) => c.name === 'void_payout')
    expect(voidCall).toBeDefined()
    expect(voidCall?.params.p_payout_id).toBe('payout_uuid_1')
    expect(voidCall?.params.p_status).toBe('failed')
  })

  test('Stripe payouts.create throws -> captureException + void_payout + rethrow (ledger compensated)', async () => {
    const boom = new Error('stripe: account temporarily unable to receive payouts')
    const { stripe, payoutCalls } = buildStripe({ availableCents: 1_000_000, throwOnCreate: boom })
    const admin = buildAdmin({ stripeAccountId: 'acct_org_1' })

    await expect(
      createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })
    ).rejects.toThrow(/temporarily unable/)

    expect(payoutCalls).toHaveLength(1)
    expect(mockedCapture).toHaveBeenCalled()
    const voidCall = admin.rpcCalls.find((c) => c.name === 'void_payout')
    expect(voidCall).toBeDefined()
    expect(voidCall?.params.p_payout_id).toBe('payout_uuid_1')
    expect(voidCall?.params.p_status).toBe('failed')
    // Row never back-filled because the Stripe call failed.
    expect(admin.payoutUpdates).toHaveLength(0)
  })

  test('idempotency: the Stripe idempotency key equals the DB payout id', async () => {
    const { stripe, payoutCalls } = buildStripe({ availableCents: 1_000_000 })
    const admin = buildAdmin({
      stripeAccountId: 'acct_org_1',
      disburse: {
        data: {
          success: true,
          payout_id: 'unique-payout-uuid-42',
          amount_cents: 2_000,
          available_before_cents: 2_000,
          available_after_cents: 0,
        },
        error: null,
      },
    })

    await createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })

    expect(payoutCalls[0].options?.idempotencyKey).toBe('unique-payout-uuid-42')
  })

  test('refuses when the organisation has no connected Stripe account (no claim, no payout)', async () => {
    const { stripe, payoutCalls } = buildStripe()
    const admin = buildAdmin({ stripeAccountId: null })

    const result = await createPayout(admin.client, stripe, { organisationId: 'org_1', currency: 'AUD' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('stripe_account_not_set')
    expect(payoutCalls).toHaveLength(0)
    expect(admin.rpcCalls.find((c) => c.name === 'disburse_payout')).toBeUndefined()
  })

  test('rejects a non-positive / non-integer explicit amount before any Stripe or DB call', async () => {
    const { stripe, payoutCalls } = buildStripe()
    const admin = buildAdmin()

    for (const bad of [0, -1, 1.5]) {
      const result = await createPayout(admin.client, stripe, {
        organisationId: 'org_1',
        currency: 'AUD',
        amountCents: bad,
      })
      expect(result.success).toBe(false)
      if (result.success) throw new Error('expected failure')
      expect(result.error).toBe('invalid_input')
    }
    expect(payoutCalls).toHaveLength(0)
    expect(admin.rpcCalls).toHaveLength(0)
  })
})

describe('voidPayoutById', () => {
  test('passes through the RPC result', async () => {
    const admin = buildAdmin({
      voidResult: { data: { success: true, reversed: true, payout_id: 'p1', amount_cents: 5_720 }, error: null },
    })

    const result = await voidPayoutById(admin.client, 'p1', 'failed', 'stripe failure')

    expect(result).toMatchObject({ success: true, reversed: true })
    const call = admin.rpcCalls.find((c) => c.name === 'void_payout')
    expect(call?.params).toMatchObject({ p_payout_id: 'p1', p_status: 'failed', p_reason: 'stripe failure' })
  })

  test('passes through the idempotent already_reversed result', async () => {
    const admin = buildAdmin({
      voidResult: { data: { success: true, already_reversed: true, payout_id: 'p1' }, error: null },
    })

    const result = await voidPayoutById(admin.client, 'p1', 'canceled')

    expect(result).toMatchObject({ success: true, already_reversed: true })
    const call = admin.rpcCalls.find((c) => c.name === 'void_payout')
    expect(call?.params.p_status).toBe('canceled')
  })
})

describe('runReserveRelease', () => {
  test('returns the RPC release count', async () => {
    const admin = buildAdmin({ release: { data: 7, error: null } })
    const count = await runReserveRelease(admin.client)
    expect(count).toBe(7)
    expect(admin.rpcCalls.find((c) => c.name === 'release_holds')).toBeDefined()
  })

  test('returns 0 when the RPC returns null', async () => {
    const admin = buildAdmin({ release: { data: null, error: null } })
    const count = await runReserveRelease(admin.client)
    expect(count).toBe(0)
  })
})
