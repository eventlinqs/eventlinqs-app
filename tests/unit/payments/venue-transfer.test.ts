import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TransferGateway, CreateTransferParams } from '@/lib/payments/gateway'

vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/payments/pricing-rules', () => ({
  getPayoutScheduleDays: vi.fn().mockResolvedValue(3),
}))

import { createVenueTransfer } from '@/lib/payments/venue-transfer'

function buildStripe(availableCents = 1_000_000, currency = 'aud'): Stripe {
  return {
    balance: {
      retrieve: vi.fn(async () => ({ available: [{ amount: availableCents, currency }], pending: [] })),
    },
  } as unknown as Stripe
}

function buildGateway(opts: { throwOnCreate?: Error } = {}) {
  const calls: CreateTransferParams[] = []
  const gateway: TransferGateway = {
    name: 'mock',
    async createTransfer(params) {
      calls.push(params)
      if (opts.throwOnCreate) throw opts.throwOnCreate
      return {
        transfer_id: 'tr_venue_1',
        amount_cents: params.amount_cents,
        currency: params.currency.toUpperCase(),
        destination: params.destination_account_id,
      }
    },
    async reverseTransfer(params) {
      return { reversal_id: 'trr_1', amount_cents: params.amount_cents ?? 0 }
    },
  }
  return { gateway, calls }
}

interface AdminOpts {
  disburse: Record<string, unknown>
  voidCalls: Array<Record<string, unknown>>
  updates: Array<Record<string, unknown>>
}

function buildAdmin(opts: AdminOpts): SupabaseClient {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'disburse_venue_share') return { data: opts.disburse, error: null }
    if (name === 'void_venue_payout') {
      opts.voidCalls.push(args)
      return { data: { success: true }, error: null }
    }
    return { data: null, error: null }
  })
  const from = vi.fn((table: string) => {
    if (table === 'venue_payouts') {
      return {
        update: (row: Record<string, unknown>) => {
          opts.updates.push(row)
          return { eq: vi.fn(async () => ({ error: null })) }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { rpc, from } as unknown as SupabaseClient
}

const PARAMS = {
  venueId: 'venue_1',
  eventId: 'event_1',
  currency: 'AUD',
  destinationAccountId: 'acct_venue',
  amountCents: null,
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.clearAllMocks())

describe('createVenueTransfer (post-event venue payout)', () => {
  test('happy path: claims, transfers the accrued share, backfills the row paid', async () => {
    const opts: AdminOpts = {
      disburse: { success: true, payout_id: 'vp1', amount_cents: 41, available_before_cents: 41, available_after_cents: 0 },
      voidCalls: [],
      updates: [],
    }
    const admin = buildAdmin(opts)
    const { gateway, calls } = buildGateway()

    const res = await createVenueTransfer(admin, gateway, buildStripe(), PARAMS)

    expect(res).toMatchObject({ success: true, payoutId: 'vp1', stripeTransferId: 'tr_venue_1', amountCents: 41 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      amount_cents: 41,
      currency: 'AUD',
      destination_account_id: 'acct_venue',
      idempotency_key: 'vp1',
    })
    expect(calls[0].metadata).toMatchObject({ source: 'venue_revenue_share', venue_id: 'venue_1' })
    expect(opts.updates[0]).toMatchObject({ stripe_transfer_id: 'tr_venue_1', status: 'paid' })
    expect(opts.voidCalls).toHaveLength(0)
  })

  test('nothing_to_disburse: no transfer, no void', async () => {
    const opts: AdminOpts = { disburse: { success: false, error: 'nothing_to_disburse', available_cents: 0 }, voidCalls: [], updates: [] }
    const { gateway, calls } = buildGateway()
    const res = await createVenueTransfer(buildAdmin(opts), gateway, buildStripe(), PARAMS)

    expect(res).toMatchObject({ success: false, error: 'nothing_to_disburse' })
    expect(calls).toHaveLength(0)
    expect(opts.voidCalls).toHaveLength(0)
  })

  test('exceeds platform balance: voids the claim, makes no transfer', async () => {
    const opts: AdminOpts = { disburse: { success: true, payout_id: 'vp2', amount_cents: 5_000 }, voidCalls: [], updates: [] }
    const { gateway, calls } = buildGateway()
    const res = await createVenueTransfer(buildAdmin(opts), gateway, buildStripe(1_000), PARAMS)

    expect(res).toMatchObject({ success: false, error: 'exceeds_platform_balance' })
    expect(calls).toHaveLength(0)
    expect(opts.voidCalls).toHaveLength(1)
    expect(opts.voidCalls[0]).toMatchObject({ p_payout_id: 'vp2', p_status: 'failed' })
  })

  test('transfer failure: voids the claim and rethrows', async () => {
    const opts: AdminOpts = { disburse: { success: true, payout_id: 'vp3', amount_cents: 41 }, voidCalls: [], updates: [] }
    const { gateway } = buildGateway({ throwOnCreate: new Error('stripe venue transfer boom') })

    await expect(createVenueTransfer(buildAdmin(opts), gateway, buildStripe(), PARAMS)).rejects.toThrow('stripe venue transfer boom')
    expect(opts.voidCalls).toHaveLength(1)
    expect(opts.voidCalls[0]).toMatchObject({ p_payout_id: 'vp3' })
  })
})
