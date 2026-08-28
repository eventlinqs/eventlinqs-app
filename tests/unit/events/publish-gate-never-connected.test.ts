import { describe, expect, it } from 'vitest'
import { checkPublishGate } from '@/lib/events/publish-gate'

/**
 * AN ORGANISER WHO HAS NEVER CONNECTED STRIPE MUST BE TOLD THAT.
 *
 * Found by journey 2 on 28 August 2026, at the worst possible moment: the last
 * press of a seven-step wizard, after the organiser has signed up, built an
 * event, priced it and uploaded artwork.
 *
 * With no stripe_account_id there is nothing for the reconciler to read, so it
 * failed with `stripe_error`, and the "Stripe unreachable" branch answered:
 *
 *   "We could not check your Stripe status just now ... Nothing is wrong with
 *    your account as far as we know. Try again shortly."
 *
 * Every clause of that is false for this organiser. Nothing failed to check,
 * because there was nothing to check. Something IS wrong: they have not
 * connected payouts. And trying again shortly will never work, because waiting
 * does not connect Stripe. It is the founder's one rule broken exactly: a
 * refusal that is not true about its own cause, and that sends the person away
 * to wait instead of to the screen that fixes it.
 *
 * The reconciler is passed as a function that FAILS, deliberately, because that
 * is what the real one does for an account that does not exist. A test that
 * passed a working reconciler would prove nothing about this path.
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
}

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as never
}

const NEVER_CONNECTED = {
  stripe_account_id: null,
  stripe_charges_enabled: false,
  stripe_payouts_enabled: false,
  payout_status: 'unset',
  stripe_account_country: 'AU',
}

/** What the real reconciler does when there is no account to read. */
const failingReconcile = async () => ({ ok: false, reason: 'stripe_error' }) as never

describe('a paid event from an organiser who never connected Stripe', () => {
  it('names Stripe as the cause and does not blame a failed check', async () => {
    const result = await checkPublishGate(clientReturning(NEVER_CONNECTED), PAID, failingReconcile)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toBe('paid_event_charges_disabled')
    expect(result.message).toMatch(/connect stripe/i)

    // The three false clauses, each pinned so they cannot come back.
    expect(result.message, 'must not claim the check failed').not.toMatch(/could not check/i)
    expect(result.message, 'must not claim nothing is wrong').not.toMatch(/nothing is wrong/i)
    expect(result.message, 'must not promise that waiting helps').not.toMatch(/try again shortly/i)
  })

  it('points at the screen that fixes it', async () => {
    const result = await checkPublishGate(clientReturning(NEVER_CONNECTED), PAID, failingReconcile)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.nextAction?.href).toBe('/dashboard/payouts')
  })

  it('still says free events can go live, so the wizard is not a dead end', async () => {
    const result = await checkPublishGate(clientReturning(NEVER_CONNECTED), PAID, failingReconcile)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/free events/i)
  })

  it('a FREE event from the same organiser publishes', async () => {
    const free = { ...PAID, tiersHavePaid: false }
    const result = await checkPublishGate(clientReturning(NEVER_CONNECTED), free, failingReconcile)
    expect(result.ok).toBe(true)
  })

  it('an organisation that HAS an account still goes through the reconciler', async () => {
    // The fix must not swallow the case it was not written for: an account that
    // exists but is unreachable is still "we could not check", correctly.
    const connected = { ...NEVER_CONNECTED, stripe_account_id: 'acct_x' }
    const result = await checkPublishGate(clientReturning(connected), PAID, failingReconcile)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not check your Stripe status/i)
  })
})
