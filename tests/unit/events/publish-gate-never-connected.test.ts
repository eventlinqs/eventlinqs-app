import { describe, expect, it } from 'vitest'
import { checkPublishGate } from '@/lib/events/publish-gate'

/**
 * AN ORGANISER WHO HAS NEVER CONNECTED STRIPE PUBLISHES AND SELLS.
 *
 * Lawal's yes, 15:22 on 14 November 2026: "Yes, you let organisers publish and
 * sell straight away ... Finish my platform and let this be live." Eventbrite,
 * Humanitix and Ticketmaster's Universe all let a new organiser sell before a
 * payout account is connected (C:/dev/START-16OCT/EL-SELLING-PATH-14NOV/
 * leaders-organiser-selling.md). Under A2 (29 September) EventLinqs holds the
 * money until after the event and pays the organiser's own connected account
 * then (10 October), so connecting payouts is a step before the payout, never a
 * wall at the publish.
 *
 * WHAT THIS REPLACES. Found by journey 2 on 28 August 2026: the last press of a
 * seven-step wizard refused a paid event from an organiser with no Stripe
 * account, first with a false "we could not check your Stripe status", then with
 * "Connect Stripe before publishing a paid event". Both are gone with the wall.
 * The one thing kept from that finding is the rule that a refusal is true about
 * its own cause: the only refusals left are a hold placed by EventLinqs and a
 * country we cannot settle in, and each says so and points at a person.
 *
 * `payout_status 'unset'` is the platform's own word for "no Stripe account"
 * (20260809000001_payout_status_unset.sql), so it is the fixture here.
 */

const PAID = {
  organisationId: 'org_1',
  tiersHavePaid: true,
  coverImageUrl: 'https://x/y.jpg',
  // A future end, a physical event with a venue: everything the OTHER gate
  // rules need in order to be satisfied, so each test isolates its own subject.
  endsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  isPhysical: true,
  venueName: 'The Wool Exchange',
  venueAddress: '44 Moorabool St, Geelong',
  walkIn: null,
}

/** A client that answers the organisation read, and fails the test if anything else is asked of it. */
function clientReturning(row: Record<string, unknown> | null) {
  const tables: string[] = []
  const client = {
    from: (table: string) => {
      tables.push(table)
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }
    },
  }
  return { client: client as never, tables }
}

const NEVER_CONNECTED = {
  stripe_account_id: null,
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  payout_status: 'unset',
  stripe_account_country: null,
}

describe('a paid event from an organiser who never connected Stripe (sell first)', () => {
  it('publishes', async () => {
    const { client } = clientReturning(NEVER_CONNECTED)
    const result = await checkPublishGate(client, PAID)
    expect(result.ok).toBe(true)
  })

  it('publishes whatever stage of Stripe the organiser has reached', async () => {
    for (const row of [
      { ...NEVER_CONNECTED, payout_status: 'active' },
      { ...NEVER_CONNECTED, stripe_account_id: 'acct_x', stripe_account_country: 'AU', payout_status: 'active' },
      { ...NEVER_CONNECTED, stripe_account_id: 'acct_x', stripe_account_country: 'AU', payout_status: 'restricted' },
    ]) {
      const { client } = clientReturning(row)
      const result = await checkPublishGate(client, PAID)
      expect(result.ok, JSON.stringify(row)).toBe(true)
    }
  })

  it('reads only the organisation row: no Stripe call decides a publish', async () => {
    const { client, tables } = clientReturning(NEVER_CONNECTED)
    await checkPublishGate(client, PAID)
    expect(tables).toEqual(['organisations'])
  })

  it('a FREE event from the same organiser publishes without reading it at all', async () => {
    const { client, tables } = clientReturning(NEVER_CONNECTED)
    const result = await checkPublishGate(client, { ...PAID, tiersHavePaid: false })
    expect(result.ok).toBe(true)
    expect(tables).toEqual([])
  })
})

describe('the two refusals left, each true about its cause', () => {
  it('a hold placed by EventLinqs refuses, says so, and points at a person', async () => {
    const { client } = clientReturning({ ...NEVER_CONNECTED, payout_status: 'on_hold' })
    const result = await checkPublishGate(client, PAID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('organisation_payouts_restricted')
    expect(result.message).toMatch(/paused/i)
    expect(result.message).toMatch(/EventLinqs support/)
    expect(result.message, 'must not send the organiser to Stripe about our own hold').not.toMatch(/connect stripe/i)
    expect(result.nextAction?.href).toBe('/contact')
  })

  it('a connected account in a country we cannot settle in refuses, and says that', async () => {
    const { client } = clientReturning({ ...NEVER_CONNECTED, stripe_account_id: 'acct_x', stripe_account_country: 'ZZ', payout_status: 'active' })
    const result = await checkPublishGate(client, PAID)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/country/i)
    expect(result.nextAction?.href).toBe('/contact')
  })
})
