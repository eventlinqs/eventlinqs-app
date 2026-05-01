import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { handleConnectAccountUpdated } from '@/lib/stripe/connect-handlers'
import { createAdminClient } from '@/lib/supabase/admin'

type AnyRecord = Record<string, unknown>

type SelectResult = { data: AnyRecord | null; error: { message: string } | null }
type WriteResult = { error: { message: string } | null }

interface AdminMock {
  from: ReturnType<typeof vi.fn>
  organisationsSelectResult: SelectResult
  organisationsUpdateResult: WriteResult
  organisationsTierUpdateResult: WriteResult
  tierLogInsertResult: WriteResult
  organisationsUpdatePayloads: AnyRecord[]
  tierLogInserts: AnyRecord[]
  organisationsSelectFilters: AnyRecord[]
  organisationsUpdateFilters: AnyRecord[]
}

function buildAdminMock(overrides: Partial<AdminMock> = {}): AdminMock {
  const state: AdminMock = {
    from: vi.fn(),
    organisationsSelectResult: { data: null, error: null },
    organisationsUpdateResult: { error: null },
    organisationsTierUpdateResult: { error: null },
    tierLogInsertResult: { error: null },
    organisationsUpdatePayloads: [],
    tierLogInserts: [],
    organisationsSelectFilters: [],
    organisationsUpdateFilters: [],
    ...overrides,
  }

  state.from.mockImplementation((table: string) => {
    if (table === 'organisations') {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            state.organisationsSelectFilters.push({ column, value })
            return {
              maybeSingle: async () => state.organisationsSelectResult,
            }
          },
        }),
        update: (payload: AnyRecord) => {
          state.organisationsUpdatePayloads.push(payload)
          return {
            eq: async (column: string, value: unknown) => {
              state.organisationsUpdateFilters.push({ column, value })
              const isTierUpdate =
                Object.keys(payload).length === 2 &&
                payload.payout_tier === 'tier_1' &&
                'updated_at' in payload &&
                column === 'id'
              return isTierUpdate
                ? state.organisationsTierUpdateResult
                : state.organisationsUpdateResult
            },
          }
        },
      }
    }
    if (table === 'tier_progression_log') {
      return {
        insert: async (row: AnyRecord) => {
          state.tierLogInserts.push(row)
          return state.tierLogInsertResult
        },
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return state
}

function makeAccount(overrides: Partial<Stripe.Account> = {}): Stripe.Account {
  return {
    id: 'acct_test_123',
    object: 'account',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    country: 'US',
    capabilities: { card_payments: 'active', transfers: 'active' },
    requirements: { currently_due: [], past_due: [] },
    external_accounts: {
      object: 'list',
      data: [
        {
          id: 'ba_test_external_1',
          object: 'bank_account',
        } as unknown as Stripe.BankAccount,
      ],
      has_more: false,
      total_count: 1,
      url: '',
    },
    ...overrides,
  } as unknown as Stripe.Account
}

describe('handleConnectAccountUpdated tier_progression_log insert path', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  test('inserts tier_progression_log row with reason auto_promotion when fully onboarded and previously incomplete', async () => {
    const admin = buildAdminMock({
      organisationsSelectResult: {
        data: {
          id: 'org_test_uuid',
          stripe_onboarding_complete: false,
          payout_tier: 'tier_0',
          payout_destination: null,
        },
        error: null,
      },
    })
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    )

    await handleConnectAccountUpdated(
      makeAccount({ id: 'acct_full_onboard' }),
      'evt_full_1'
    )

    expect(admin.tierLogInserts).toHaveLength(1)
    const inserted = admin.tierLogInserts[0]
    expect(inserted).toMatchObject({
      organisation_id: 'org_test_uuid',
      from_tier: 'tier_0',
      to_tier: 'tier_1',
      reason: 'auto_promotion',
      metadata: {
        webhook_event_id: 'evt_full_1',
        stripe_account_id: 'acct_full_onboard',
      },
    })

    const tierUpdate = admin.organisationsUpdatePayloads.find(
      (p) => p.payout_tier === 'tier_1'
    )
    expect(tierUpdate).toBeDefined()
    expect(tierUpdate?.payout_tier).toBe('tier_1')
  })

  test('does NOT insert tier_progression_log row when payouts_enabled is false', async () => {
    const admin = buildAdminMock({
      organisationsSelectResult: {
        data: {
          id: 'org_test_uuid',
          stripe_onboarding_complete: false,
          payout_tier: 'tier_0',
          payout_destination: null,
        },
        error: null,
      },
    })
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    )

    await handleConnectAccountUpdated(
      makeAccount({
        id: 'acct_partial_onboard',
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
      }),
      'evt_partial_1'
    )

    expect(admin.tierLogInserts).toHaveLength(0)
    const tierUpdate = admin.organisationsUpdatePayloads.find(
      (p) => p.payout_tier === 'tier_1'
    )
    expect(tierUpdate).toBeUndefined()
  })

  test('does NOT insert tier_progression_log row when org was already fully onboarded', async () => {
    const admin = buildAdminMock({
      organisationsSelectResult: {
        data: {
          id: 'org_test_uuid',
          stripe_onboarding_complete: true,
          payout_tier: 'tier_1',
          payout_destination: 'ba_test_external_1',
        },
        error: null,
      },
    })
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    )

    await handleConnectAccountUpdated(
      makeAccount({ id: 'acct_already_onboarded' }),
      'evt_redelivery_1'
    )

    expect(admin.tierLogInserts).toHaveLength(0)
  })
})
