import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { StripeAdapter, resolveWebhookSecrets } from '@/lib/payments/stripe-adapter'

/**
 * Proves the webhook handler verifies against EVERY configured signing secret.
 *
 * The defect this closes: Stripe mints a DIFFERENT signing secret per endpoint,
 * and the platform needs two live endpoints at once - the account endpoint
 * (payment_intent, charge, checkout.session, transfer) and the
 * connected-accounts endpoint (account.*, payout.*, charge.dispute.*). With a
 * single-secret check, every delivery from the second endpoint failed signature
 * verification and 400d, so Connect payouts and disputes never reached the
 * handler while the account endpoint looked perfectly healthy.
 *
 * The signatures below are built with the real Stripe scheme
 * (`t=<ts>,v1=<hmac-sha256 of "<ts>.<payload>">`) and verified by the real
 * `stripe.webhooks.constructEvent`, so this exercises genuine cryptographic
 * verification, not a mock.
 */

const PLATFORM_SECRET = 'whsec_' + 'a'.repeat(32)
const CONNECT_SECRET = 'whsec_' + 'b'.repeat(32)
const UNKNOWN_SECRET = 'whsec_' + 'c'.repeat(32)

function signedHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  return `t=${timestamp},v1=${mac}`
}

const platformEvent = JSON.stringify({
  id: 'evt_test_platform',
  object: 'event',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_test_123', object: 'payment_intent' } },
})

const connectEvent = JSON.stringify({
  id: 'evt_test_connect',
  object: 'event',
  type: 'payout.paid',
  account: 'acct_test_123',
  data: { object: { id: 'po_test_123', object: 'payout' } },
})

describe('resolveWebhookSecrets', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('parses the comma-separated plural form', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', `${PLATFORM_SECRET},${CONNECT_SECRET}`)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET, CONNECT_SECRET])
  })

  test('tolerates whitespace and trailing separators', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', `  ${PLATFORM_SECRET} , ${CONNECT_SECRET} , `)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET, CONNECT_SECRET])
  })

  test('BACKWARD COMPATIBILITY: the singular form alone still works', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', PLATFORM_SECRET)
    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET])
  })

  test('the singular form is appended to the plural, not replaced by it', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', PLATFORM_SECRET)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', CONNECT_SECRET)
    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET, CONNECT_SECRET])
  })

  test('duplicates are collapsed so a repeated secret costs no extra attempt', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', `${PLATFORM_SECRET},${PLATFORM_SECRET}`)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', PLATFORM_SECRET)
    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET])
  })

  test('returns empty when nothing is configured', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    expect(resolveWebhookSecrets()).toEqual([])
  })
})

describe('constructWebhookEvent verifies against every configured secret', () => {
  const adapter = new StripeAdapter()

  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy_key_for_signature_verification')
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', `${PLATFORM_SECRET},${CONNECT_SECRET}`)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('an event signed with the FIRST secret verifies', async () => {
    const sig = signedHeader(platformEvent, PLATFORM_SECRET)
    const event = (await adapter.constructWebhookEvent(platformEvent, sig)) as { id: string; type: string }
    expect(event.id).toBe('evt_test_platform')
    expect(event.type).toBe('payment_intent.succeeded')
  })

  test('THE FIX: an event signed with the SECOND secret also verifies', async () => {
    const sig = signedHeader(connectEvent, CONNECT_SECRET)
    const event = (await adapter.constructWebhookEvent(connectEvent, sig)) as {
      id: string
      type: string
      account: string
    }
    expect(event.id).toBe('evt_test_connect')
    expect(event.type).toBe('payout.paid')
    // Connected-account events carry `account`, which the route reads to
    // attribute the event to the right organiser.
    expect(event.account).toBe('acct_test_123')
  })

  test('an event signed with an UNKNOWN secret is still rejected', async () => {
    const sig = signedHeader(platformEvent, UNKNOWN_SECRET)
    await expect(adapter.constructWebhookEvent(platformEvent, sig)).rejects.toThrow()
  })

  test('a garbage signature header is rejected', async () => {
    await expect(
      adapter.constructWebhookEvent(platformEvent, 't=1,v1=deadbeef'),
    ).rejects.toThrow()
  })

  test('a tampered payload is rejected even with a well-formed signature', async () => {
    const sig = signedHeader(platformEvent, PLATFORM_SECRET)
    const tampered = platformEvent.replace('pi_test_123', 'pi_attacker_999')
    await expect(adapter.constructWebhookEvent(tampered, sig)).rejects.toThrow()
  })

  test('with NO secret configured it throws a named error rather than accepting', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const sig = signedHeader(platformEvent, PLATFORM_SECRET)
    await expect(adapter.constructWebhookEvent(platformEvent, sig)).rejects.toThrow(
      /No Stripe webhook secret is set/,
    )
  })

  test('the singular form alone still verifies its own events', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRETS', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', PLATFORM_SECRET)
    const sig = signedHeader(platformEvent, PLATFORM_SECRET)
    const event = (await adapter.constructWebhookEvent(platformEvent, sig)) as { id: string }
    expect(event.id).toBe('evt_test_platform')
  })
})
