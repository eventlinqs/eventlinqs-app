import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * PAY-01 (interim): connected accounts must not be left on Stripe's fast
 * automatic payout default (which lets organiser funds, including the reserve
 * the ledger thinks it holds, leave before reserves/refunds settle). Both
 * account creation and the backfill helper must set an explicit payout
 * schedule with the configured delay. These tests assert the exact params
 * sent to Stripe, deterministically and offline (no network).
 */

const h = vi.hoisted(() => ({
  createArgs: [] as unknown[],
  updateArgs: [] as unknown[],
}))

vi.mock('stripe', () => {
  return {
    default: class FakeStripe {
      accounts = {
        create: vi.fn(async (args: unknown) => {
          h.createArgs.push(args)
          return { id: 'acct_test_created' }
        }),
        update: vi.fn(async (id: string, args: unknown) => {
          h.updateArgs.push({ id, args })
          return { id }
        }),
      }
    },
  }
})

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY

beforeEach(() => {
  h.createArgs = []
  h.updateArgs = []
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  vi.resetModules()
})
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY
  vi.clearAllMocks()
})

describe('PAY-01: explicit payout schedule on connected accounts', () => {
  test('createExpressAccount sends settings.payouts.schedule with the given delay_days', async () => {
    const { createExpressAccount } = await import('@/lib/stripe/connect')
    await createExpressAccount({
      organisationId: 'org_1',
      country: 'AU',
      email: 'org@example.com',
      payoutDelayDays: 3,
    })

    expect(h.createArgs).toHaveLength(1)
    expect(h.createArgs[0]).toMatchObject({
      type: 'express',
      country: 'AU',
      settings: { payouts: { schedule: { interval: 'daily', delay_days: 3 } } },
    })
    // Regression guard: the schedule key must be present (the bug was its absence).
    const args = h.createArgs[0] as { settings?: { payouts?: { schedule?: unknown } } }
    expect(args.settings?.payouts?.schedule).toBeDefined()
  })

  test('setPlatformPayoutSchedule backfills an existing account via accounts.update', async () => {
    const { setPlatformPayoutSchedule } = await import('@/lib/stripe/connect')
    await setPlatformPayoutSchedule('acct_existing', 3)

    expect(h.updateArgs).toHaveLength(1)
    expect(h.updateArgs[0]).toMatchObject({
      id: 'acct_existing',
      args: { settings: { payouts: { schedule: { interval: 'daily', delay_days: 3 } } } },
    })
  })
})
