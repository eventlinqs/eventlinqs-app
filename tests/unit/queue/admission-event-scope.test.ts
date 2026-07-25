import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { generateAdmissionToken, validateAdmissionToken } from '@/lib/queue/tokens'
import { admitsToEvent } from '@/proxy'

/**
 * Proves an admission token only admits the bearer to the event it was ISSUED
 * for.
 *
 * The bypass this guards: `src/proxy.ts` used to gate on
 * `validateAdmissionToken(token).valid` alone and throw the token's embedded
 * eventId away. A signature proves ISSUANCE, never SCOPE - so one token legally
 * earned by queueing for any event admitted the bearer to EVERY high-demand
 * event on the platform. For a hyped on-sale that is the whole point of the
 * queue defeated: join the queue for a quiet event, get admitted in seconds,
 * then reuse that token to walk past the gate on the event that actually has
 * demand.
 */

const SECRET = 'q'.repeat(64)

const EVENT_A = '11111111-1111-4111-8111-111111111111'
const EVENT_B = '22222222-2222-4222-8222-222222222222'
const QUEUE_ID = '33333333-3333-4333-8333-333333333333'

function futureMs() {
  return Date.now() + 5 * 60 * 1000
}

describe('admission tokens are scoped to one event', () => {
  beforeEach(() => {
    vi.stubEnv('QUEUE_SECRET', SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('a token issued for event A admits to event A', () => {
    const token = generateAdmissionToken(QUEUE_ID, EVENT_A, futureMs())
    expect(admitsToEvent(token, EVENT_A)).toBe(true)
  })

  test('THE FIX: a valid token issued for event A is REJECTED for event B', () => {
    const token = generateAdmissionToken(QUEUE_ID, EVENT_A, futureMs())

    // Pin down that this is the real bypass and not a broken token. The OLD
    // gate condition was exactly `validateAdmissionToken(token).valid`, and it
    // is still true here: the signature is genuinely valid, the token has
    // simply been presented for the wrong event. So the old code admitted.
    const asOldGateSawIt = validateAdmissionToken(token)
    expect(asOldGateSawIt.valid).toBe(true)
    expect(asOldGateSawIt.valid && asOldGateSawIt.eventId).toBe(EVENT_A)

    // The new gate compares that embedded eventId to the event being requested.
    expect(admitsToEvent(token, EVENT_B)).toBe(false)
  })

  test('cross-event rejection is not an accident of validity: both directions hold', () => {
    const tokenA = generateAdmissionToken(QUEUE_ID, EVENT_A, futureMs())
    const tokenB = generateAdmissionToken(QUEUE_ID, EVENT_B, futureMs())

    expect(admitsToEvent(tokenA, EVENT_A)).toBe(true)
    expect(admitsToEvent(tokenB, EVENT_B)).toBe(true)
    expect(admitsToEvent(tokenA, EVENT_B)).toBe(false)
    expect(admitsToEvent(tokenB, EVENT_A)).toBe(false)
  })

  test('an expired token for the right event is still rejected', () => {
    const token = generateAdmissionToken(QUEUE_ID, EVENT_A, Date.now() - 1000)
    expect(admitsToEvent(token, EVENT_A)).toBe(false)
  })

  test('a tampered token is rejected even when the eventId reads correctly', () => {
    const token = generateAdmissionToken(QUEUE_ID, EVENT_A, futureMs())
    const raw = Buffer.from(token, 'base64url').toString('utf8')

    // Swap the eventId in the plaintext, leaving the original MAC in place -
    // the attack the eventId check must not open the door to.
    const forged = Buffer.from(raw.replace(EVENT_A, EVENT_B), 'utf8').toString('base64url')

    expect(admitsToEvent(forged, EVENT_B)).toBe(false)
    expect(admitsToEvent(forged, EVENT_A)).toBe(false)
  })

  test('garbage is rejected rather than thrown', () => {
    expect(admitsToEvent('not-a-token', EVENT_A)).toBe(false)
    expect(admitsToEvent('', EVENT_A)).toBe(false)
  })
})
