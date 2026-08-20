import { describe, expect, it } from 'vitest'
import { checkPublishGate } from '@/lib/events/publish-gate'
import { isOrganiserSellable, verifyOrgSaleFields } from '@/lib/payments/sale-status'

/**
 * PUBLISHING A PAID EVENT AND SELLING A TICKET MUST AGREE.
 *
 * Founder ruling 2026-08-19. The publish gate used to allow
 * `stripe_charges_enabled && payout_status !== 'restricted'`, two loose checks where
 * the sale gate makes five strict ones. An organiser on hold, or with payouts not yet
 * enabled, or in an unsupported country, could publish a paid event that the sale gate
 * then refused to sell: the organiser promotes a night that cannot take a cent and the
 * buyer meets a message that reads as a platform fault.
 *
 * This is a PROPERTY test rather than a list of cases. For every combination of the
 * five columns the sale gate reads, publishing a paid event must reach the same verdict
 * as selling a ticket. Enumerating the matrix means a future edit to either side that
 * breaks the agreement fails here, without anybody having to think of the case.
 *
 * `reconcile: null` is passed throughout so each decision is made on the row alone.
 * With the real reconciler a refusal first re-reads Stripe, which is correct for the
 * organiser-facing action but would make this test about Stripe rather than about the
 * two predicates agreeing.
 */

const PAID = { organisationId: 'org_1', tiersHavePaid: true, coverImageUrl: 'https://x/y.jpg' }

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as never
}

/** Every combination of the five gate columns that matters. */
const ACCOUNTS = [null, 'acct_x']
const CHARGES = [true, false]
const PAYOUTS = [true, false]
const COUNTRIES = ['AU', 'ZZ', null]
const STATUSES = ['active', 'restricted', 'on_hold', 'unset']

describe('the publish gate agrees with the sale gate on every column combination', () => {
  const rows: Record<string, unknown>[] = []
  for (const stripe_account_id of ACCOUNTS) {
    for (const stripe_charges_enabled of CHARGES) {
      for (const stripe_payouts_enabled of PAYOUTS) {
        for (const stripe_account_country of COUNTRIES) {
          for (const payout_status of STATUSES) {
            rows.push({
              stripe_account_id,
              stripe_charges_enabled,
              stripe_payouts_enabled,
              stripe_account_country,
              payout_status,
            })
          }
        }
      }
    }
  }

  it(`covers the full matrix (${ACCOUNTS.length * CHARGES.length * PAYOUTS.length * COUNTRIES.length * STATUSES.length} rows)`, () => {
    expect(rows).toHaveLength(2 * 2 * 2 * 3 * 4)
  })

  it('allows publishing a paid event exactly when the sale gate would allow selling', async () => {
    const disagreements: string[] = []

    for (const row of rows) {
      const verdict = verifyOrgSaleFields(row)
      // Every row here carries all five keys, so this is complete by construction.
      // If it were not, the assertion below would be about presence rather than
      // about the two predicates, which is why it is checked rather than assumed.
      expect(verdict.complete).toBe(true)
      if (!verdict.complete) continue

      const canSell = isOrganiserSellable(verdict.org)
      const publish = await checkPublishGate(clientReturning(row), PAID, null)

      if (canSell !== publish.ok) {
        disagreements.push(
          `${JSON.stringify(row)}  sale=${canSell} publish=${publish.ok} (${publish.ok ? '' : publish.reason})`,
        )
      }
    }

    expect(disagreements, `publish and sale disagreed on:\n${disagreements.join('\n')}`).toEqual([])
  })

  it('a FREE event still publishes regardless of the Stripe posture', async () => {
    // The alignment is about PAID events only. A free event takes no money, so none
    // of the five columns can stop it, and tightening that would break every
    // community event on the platform.
    const worst = {
      stripe_account_id: null,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_country: null,
      payout_status: 'restricted',
    }
    const free = { organisationId: 'org_1', tiersHavePaid: false, coverImageUrl: 'https://x/y.jpg' }
    const result = await checkPublishGate(clientReturning(worst), free, null)
    expect(result.ok).toBe(true)
  })

  it('still refuses a paid event with no cover, before reading the organisation at all', async () => {
    // The cover check runs first and must not be reachable-around by the alignment.
    const sellable = {
      stripe_account_id: 'acct_x',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_account_country: 'AU',
      payout_status: 'active',
    }
    const noCover = { organisationId: 'org_1', tiersHavePaid: true, coverImageUrl: null }
    const result = await checkPublishGate(clientReturning(sellable), noCover, null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('cover_image_required')
  })
})
