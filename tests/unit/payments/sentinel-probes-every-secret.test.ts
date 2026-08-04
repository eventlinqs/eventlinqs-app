import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { selfProbe } from '@/lib/health/payment-checks'
import { resolveWebhookSecrets } from '@/lib/payments/stripe-adapter'

/**
 * Proves the payment sentinel probes the real webhook route ONCE PER
 * CONFIGURED SIGNING SECRET, so the platform endpoint's secret AND the
 * connected-accounts endpoint's secret are both exercised on every run.
 *
 * The gap this closes (2026-07-26): `selfProbe` signed with the SINGULAR
 * `STRIPE_WEBHOOK_SECRET` only. The pair the founder set in
 * `STRIPE_WEBHOOK_SECRETS` was therefore never exercised on the deployment that
 * serves them, so the multi-secret verification loop added on 2026-07-25 had no
 * continuous proof in production. The founder will not paste a signing secret
 * into a session, so production has to prove this itself.
 *
 * Signatures below are built with the real Stripe scheme and verified here with
 * real HMAC, so this asserts each probe genuinely carries a DIFFERENT secret
 * rather than merely counting calls.
 */

const PLATFORM_SECRET = 'whsec_' + 'a'.repeat(32)
const CONNECT_SECRET = 'whsec_' + 'b'.repeat(32)
const LEGACY_SECRET = 'whsec_' + 'c'.repeat(32)

const ORIGIN = 'https://www.eventlinqs.com.au'

type Captured = { url: string; signature: string; body: string }

let captured: Captured[]
let envBackup: Record<string, string | undefined>

/** Does this Stripe-scheme header verify against `secret` for `body`? */
function signedWith(c: Captured, secret: string): boolean {
  const m = /^t=(\d+),v1=([a-f0-9]+)$/.exec(c.signature)
  if (!m) return false
  const expected = crypto.createHmac('sha256', secret).update(`${m[1]}.${c.body}`).digest('hex')
  return expected === m[2]
}

function mockRoute(status: number | ((call: number) => number)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      captured.push({ url: String(url), signature: init.headers['stripe-signature'], body: init.body })
      const s = typeof status === 'function' ? status(captured.length) : status
      return { ok: s >= 200 && s < 300, status: s } as Response
    }),
  )
}

beforeEach(() => {
  captured = []
  envBackup = {
    STRIPE_WEBHOOK_SECRETS: process.env.STRIPE_WEBHOOK_SECRETS,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('selfProbe probes every configured signing secret', () => {
  test('two secrets produce TWO probes, each signed with a DIFFERENT secret', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, false)

    expect(results).toHaveLength(2)
    expect(results.every(r => r.ok)).toBe(true)
    expect(captured).toHaveLength(2)

    // Exactly one probe per secret, proven by real HMAC verification.
    expect(captured.filter(c => signedWith(c, PLATFORM_SECRET))).toHaveLength(1)
    expect(captured.filter(c => signedWith(c, CONNECT_SECRET))).toHaveLength(1)
    // And the two probes are genuinely distinct signatures.
    expect(captured[0].signature).not.toBe(captured[1].signature)
  })

  test('every probe goes to the REAL webhook route on the given origin', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    await selfProbe(ORIGIN, false)

    expect(captured.every(c => c.url === `${ORIGIN}/api/webhooks/stripe`)).toBe(true)
  })

  test('the probe payload is the no-op sentinel.probe event, so no money, order or seat is touched', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = PLATFORM_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    await selfProbe(ORIGIN, false)

    const body = JSON.parse(captured[0].body)
    expect(body.type).toBe('sentinel.probe')
    expect(body.data.object).toEqual({})
  })

  test('the singular STRIPE_WEBHOOK_SECRET is still probed, appended after the list', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    process.env.STRIPE_WEBHOOK_SECRET = LEGACY_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, false)

    expect(results).toHaveLength(3)
    expect(captured.filter(c => signedWith(c, LEGACY_SECRET))).toHaveLength(1)
  })

  test('a duplicate secret is probed ONCE, matching the route deduplication', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${PLATFORM_SECRET}`
    process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, false)

    expect(resolveWebhookSecrets()).toEqual([PLATFORM_SECRET])
    expect(results).toHaveLength(1)
  })

  /**
   * The failure that matters: one destination's secret is rejected while the
   * other is accepted. Before this change a single aggregated probe could not
   * express that at all.
   */
  test('reports PER SECRET, so one rejected secret fails alone while the other passes', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(call => (call === 2 ? 400 : 200))

    const results = await selfProbe(ORIGIN, false)

    expect(results).toHaveLength(2)
    expect(results[0].ok).toBe(true)
    expect(results[1].ok).toBe(false)
    expect(results[1].detail).toMatch(/rejected 400/)
  })

  test('names each probe by a one-way fingerprint and NEVER by the secret itself', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, false)

    for (const r of results) {
      expect(r.name).not.toContain(PLATFORM_SECRET)
      expect(r.name).not.toContain(CONNECT_SECRET)
      expect(r.detail).not.toContain(PLATFORM_SECRET)
      expect(r.detail).not.toContain(CONNECT_SECRET)
      expect(r.name).toMatch(/fp [a-f0-9]{10}/)
    }
    // The fingerprint is the documented sha256 prefix, so a sentinel log line
    // and a manual webhook-signature-probe run can be correlated by eye.
    const fp = crypto.createHash('sha256').update(PLATFORM_SECRET).digest('hex').slice(0, 10)
    expect(results.some(r => r.name.includes(fp))).toBe(true)
  })

  test('with NO secret configured it fails loudly instead of silently probing nothing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRETS
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, false)

    expect(results).toHaveLength(1)
    expect(results[0].ok).toBe(false)
    expect(results[0].detail).toMatch(/no webhook signing secret/)
    expect(captured).toHaveLength(0)
  })

  test('the mis-sign drill sends exactly ONE deliberately wrong signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(400)

    const results = await selfProbe(ORIGIN, true)

    expect(results).toHaveLength(1)
    expect(captured).toHaveLength(1)
    // Signed with neither real secret: that is the point of the drill.
    expect(signedWith(captured[0], PLATFORM_SECRET)).toBe(false)
    expect(signedWith(captured[0], CONNECT_SECRET)).toBe(false)
    expect(results[0].detail).toMatch(/correctly rejected \(400\)/)
  })

  /**
   * JOB 3: the sentinel returned 503 on production and the runtime log could
   * not say which check failed. Every check must now leave its own verdict and
   * reason in the log.
   */
  test('EVERY probe logs its own result and reason', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = `${PLATFORM_SECRET},${CONNECT_SECRET}`
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(call => (call === 2 ? 400 : 200))
    const lines: string[] = []
    ;(console.log as unknown as { mockImplementation: (f: (m: string) => void) => void })
      .mockImplementation((m: string) => { lines.push(String(m)) })

    await selfProbe(ORIGIN, false)

    const checkLines = lines.filter(l => l.startsWith('[payment-check]'))
    expect(checkLines).toHaveLength(2)
    expect(checkLines[0]).toMatch(/^\[payment-check\] PASS self-probe .* :: signed probe accepted \(200\)/)
    // The FAILING one carries both the result and the reason, which is the
    // whole point: the log answers "which check, and why" without an investigation.
    expect(checkLines[1]).toMatch(/^\[payment-check\] FAIL self-probe /)
    expect(checkLines[1]).toMatch(/rejected 400/)
    expect(checkLines[1]).toMatch(/probable cause:/)
    // And still no secret material in the log.
    for (const l of checkLines) {
      expect(l).not.toContain(PLATFORM_SECRET)
      expect(l).not.toContain(CONNECT_SECRET)
    }
  })

  test('the drill flags verification as OFF if a mis-signed probe is ACCEPTED', async () => {
    process.env.STRIPE_WEBHOOK_SECRETS = PLATFORM_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    mockRoute(200)

    const results = await selfProbe(ORIGIN, true)

    expect(results[0].ok).toBe(false)
    expect(results[0].probableCause).toMatch(/not enforcing/)
  })
})
