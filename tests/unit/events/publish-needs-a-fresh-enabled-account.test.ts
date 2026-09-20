/**
 * MONEY FIX A3 LAYER TWO: AN EVENT CANNOT GO ON SALE ON A CACHED YES NOBODY
 * CAN DATE.
 *
 * `event_cannot_publish_without_an_enabled_connected_account` is named in
 * acceptance line 3 of the item and did not exist until this file.
 *
 * WHAT THE FIVE SALE COLUMNS ACTUALLY ARE. A cache of what Stripe last said,
 * kept current by the account.updated webhook. Nothing recorded WHEN they were
 * last read, so a row that said enabled six weeks ago and has heard nothing
 * since was indistinguishable from one confirmed a minute ago, and the publish
 * gate believed both. A webhook that stops arriving changes nothing on screen
 * and raises nothing anywhere.
 *
 * THE RECONCILER IS THE SUBJECT HERE, so every test passes one. The cron path
 * passes `null` deliberately and is covered by publish-gate-matches-sale-gate,
 * which asserts publish and sale agree on the row alone.
 */
import { describe, expect, it } from 'vitest'
import { checkPublishGate } from '@/lib/events/publish-gate'
import { CONNECT_VERIFICATION_MAX_AGE_MS } from '@/lib/events/connect-verification-freshness'

const FUTURE_END = new Date(Date.now() + 7 * 864e5).toISOString()

const PAID = {
  organisationId: 'org_1',
  tiersHavePaid: true,
  coverImageUrl: 'https://x/y.jpg',
  endsAt: FUTURE_END,
  isPhysical: true,
  venueName: 'The Wool Exchange',
  venueAddress: '44 Moorabool St, Geelong',
}

const ENABLED = {
  stripe_account_id: 'acct_1',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_account_country: 'AU',
  payout_status: 'active',
}

const agoMs = (ms: number) => new Date(Date.now() - ms).toISOString()

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as never
}

/** A reconciler that answers, and counts how often it was asked. */
function reconcilerSaying(outcome: Record<string, unknown>) {
  const calls: string[] = []
  const fn = async (organisationId: string) => {
    calls.push(organisationId)
    return outcome as never
  }
  return { fn, calls }
}

describe('event_cannot_publish_without_an_enabled_connected_account', () => {
  it('a fresh verification saying enabled publishes without asking Stripe again', async () => {
    const { fn, calls } = reconcilerSaying({ ok: true, sellable: true })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: agoMs(60_000) }),
      PAID,
      fn,
    )
    expect(result.ok).toBe(true)
    expect(calls, 'a fresh cache must not cost a Stripe call').toEqual([])
  })

  it('a verification that has NEVER happened goes and asks Stripe before it grants', async () => {
    // The state every existing row is in the day this ships, and the state a
    // row reaches when account.updated stops arriving.
    const { fn, calls } = reconcilerSaying({ ok: true, sellable: true })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      fn,
    )
    expect(result.ok).toBe(true)
    expect(calls, 'an undated cache must be verified, not believed').toEqual(['org_1'])
  })

  it('a verification older than the window goes and asks Stripe before it grants', async () => {
    const { fn, calls } = reconcilerSaying({ ok: true, sellable: true })
    const result = await checkPublishGate(
      clientReturning({
        ...ENABLED,
        stripe_status_verified_at: agoMs(CONNECT_VERIFICATION_MAX_AGE_MS + 60_000),
      }),
      PAID,
      fn,
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['org_1'])
  })

  it('REFUSES when the stale row said enabled and Stripe says it is not', async () => {
    // The whole defect, in one case: the row is perfect, the account is not, and
    // before this the event would have published and sold tickets.
    const { fn } = reconcilerSaying({
      ok: true,
      sellable: false,
      canSell: false,
      payoutStatus: 'restricted',
      outstanding: [],
      disabledReason: null,
      adminHoldPreserved: false,
    })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      fn,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.nextAction?.href).toBe('/dashboard/payouts')
  })

  it('REFUSES when the cache is stale and Stripe cannot be reached, and says so honestly', async () => {
    // Fail closed. And the sentence matters: it must not tell an organiser their
    // account is broken when what failed was our ability to look.
    const { fn } = reconcilerSaying({ ok: false, reason: 'stripe_error' })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      fn,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not check your Stripe status/i)
    expect(result.message).not.toMatch(/resolve the Stripe issue/i)
  })

  it('the post-reconcile grant is the SALE GATE predicate, never the looser canSell', async () => {
    // canSell tests neither payouts_enabled nor the settlement currency, so an
    // organiser it approves can still be refused at checkout. A publish granted
    // on it promotes a night that cannot take a cent.
    const { fn } = reconcilerSaying({
      ok: true,
      sellable: false,
      canSell: true,
      // The three ways canSell and sellable disagree; this is the country one.
      sellableBlockers: ['EventLinqs cannot settle in ZZ'],
      payoutStatus: 'active',
      outstanding: [],
      disabledReason: null,
      adminHoldPreserved: false,
    })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      fn,
    )
    expect(result.ok, 'canSell true and sellable false must not publish').toBe(false)
  })

  it('a FREE event is untouched by any of this, because no money moves', async () => {
    const { fn, calls } = reconcilerSaying({ ok: true, sellable: false })
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      { ...PAID, tiersHavePaid: false },
      fn,
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual([])
  })

  it('the cron path, which passes no reconciler, still decides on the row alone', async () => {
    // publish-scheduled.ts opts out by design: it reads the row seconds before
    // it decides and must not put a Stripe call inside a fail-closed job. A
    // freshness rule there would refuse every scheduled publish on a platform
    // whose webhook is healthy, which is a new defect rather than a fix.
    const result = await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      null,
    )
    expect(result.ok).toBe(true)
  })
})

/** Nothing above may be satisfied by the gate simply never being asked. */
describe('the freshness rule is not a no-op', () => {
  it('the reconciler is called exactly once per stale publish attempt', async () => {
    const { fn, calls } = reconcilerSaying({ ok: true, sellable: true })
    await checkPublishGate(
      clientReturning({ ...ENABLED, stripe_status_verified_at: null }),
      PAID,
      fn,
    )
    expect(calls).toHaveLength(1)
  })

})
