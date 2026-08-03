import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PHASE 1.4 AND 1.5, LOCKED.
 *
 * OWASP Authentication Cheat Sheet on password recovery: the response must be
 * "If that email address is in our database, we will send you an email to reset
 * your password" whether or not the account exists. So `no_account` and `sent`
 * must be indistinguishable in status, body and shape.
 *
 * And brief 1.5: a genuine transport failure must be told apart from an
 * accepted request, with the cause logged server-side. So `send_failed` is the
 * one outcome that differs, and it is the one the founder needs to see.
 */

const dispatchPasswordReset = vi.fn()
const dispatchMagicLink = vi.fn()
const dispatchVerificationResend = vi.fn()
const applyRateLimit = vi.fn(async (_policy: string, _request: Request): Promise<Response | null> => null)

vi.mock('@/lib/auth/dispatch-auth-link', () => ({
  dispatchPasswordReset: (...a: unknown[]) => dispatchPasswordReset(...a),
  dispatchMagicLink: (...a: unknown[]) => dispatchMagicLink(...a),
  dispatchVerificationResend: (...a: unknown[]) => dispatchVerificationResend(...a),
}))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: (...a: [string, Request]) => applyRateLimit(...a),
}))

const { POST: recoverPOST } = await import('@/app/api/auth/recover/route')
const { POST: magicPOST, safeNextPath } = await import('@/app/api/auth/magic-link/route')
const { POST: resendPOST } = await import('@/app/api/auth/resend-verification/route')

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
  applyRateLimit.mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('POST /api/auth/recover, enumeration contract', () => {
  test('a registered address and an unregistered one are byte-identical', async () => {
    dispatchPasswordReset.mockResolvedValueOnce({ outcome: 'sent', messageId: 'msg_1' })
    const registered = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'real@example.com' }),
    )
    const registeredBody = await registered.text()

    dispatchPasswordReset.mockResolvedValueOnce({ outcome: 'no_account', reason: 'User not found' })
    const unregistered = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'nobody@example.com' }),
    )
    const unregisteredBody = await unregistered.text()

    expect(registered.status).toBe(unregistered.status)
    expect(registered.status).toBe(200)
    expect(registeredBody).toBe(unregisteredBody)
  })

  test('the response never contains the address that was submitted', async () => {
    dispatchPasswordReset.mockResolvedValueOnce({ outcome: 'sent', messageId: 'msg_1' })
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'lawal@example.com' }),
    )
    expect(await res.text()).not.toContain('lawal@example.com')
  })

  test('the response is the OWASP conditional, not a confirmation of sending', async () => {
    dispatchPasswordReset.mockResolvedValueOnce({ outcome: 'sent', messageId: 'msg_1' })
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }),
    )
    const body = (await res.json()) as { ok: boolean; message: string }
    expect(body.ok).toBe(true)
    expect(body.message.toLowerCase()).toContain('if that email address has')
  })

  test('a transport failure is honestly distinguished and never says the mail was sent', async () => {
    dispatchPasswordReset.mockResolvedValueOnce({
      outcome: 'send_failed',
      reason: 'Resend: domain is not verified',
    })
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }),
    )
    const body = (await res.json()) as { ok: boolean; message: string }
    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.message.toLowerCase()).toContain('our side')
    expect(body.message.toLowerCase()).not.toContain('on its way')
  })

  test('the transport failure body never leaks the provider reason', async () => {
    dispatchPasswordReset.mockResolvedValueOnce({
      outcome: 'send_failed',
      reason: 'Resend 403: The eventlinqs.com domain is not verified',
    })
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }),
    )
    const text = await res.text()
    expect(text).not.toContain('Resend')
    expect(text).not.toContain('not verified')
  })

  test('the underlying cause IS logged server-side with enough detail to diagnose', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    dispatchPasswordReset.mockResolvedValueOnce({
      outcome: 'send_failed',
      reason: 'Resend 403: domain is not verified',
    })
    await recoverPOST(post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }))
    expect(spy).toHaveBeenCalledWith(
      '[auth/recover] transport failure',
      expect.objectContaining({ email: 'a@example.com', reason: expect.stringContaining('not verified') }),
    )
  })

  test('a malformed body is a validation error, not an account signal', async () => {
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'not-an-email' }),
    )
    expect(res.status).toBe(400)
    expect(dispatchPasswordReset).not.toHaveBeenCalled()
  })

  test('the rate limiter runs before anything else', async () => {
    applyRateLimit.mockResolvedValueOnce(
      new Response(null, { status: 429 }) as unknown as null,
    )
    const res = await recoverPOST(
      post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }),
    )
    expect(res.status).toBe(429)
    expect(dispatchPasswordReset).not.toHaveBeenCalled()
  })

  test('the response-time floor blunts the timing oracle', async () => {
    // A no_account short-circuits before any mail I/O, so without a floor it
    // would return far faster than a real send. OWASP calls out the timing
    // discrepancy explicitly.
    dispatchPasswordReset.mockResolvedValueOnce({ outcome: 'no_account', reason: 'User not found' })
    const started = Date.now()
    await recoverPOST(post('https://www.eventlinqs.com.au/api/auth/recover', { email: 'a@example.com' }))
    expect(Date.now() - started).toBeGreaterThanOrEqual(850)
  }, 10_000)
})

describe('POST /api/auth/magic-link', () => {
  test('registered and unregistered are indistinguishable', async () => {
    dispatchMagicLink.mockResolvedValueOnce({ outcome: 'sent', messageId: 'm' })
    const a = await magicPOST(post('https://x.test/api/auth/magic-link', { email: 'a@example.com' }))
    dispatchMagicLink.mockResolvedValueOnce({ outcome: 'no_account', reason: 'User not found' })
    const b = await magicPOST(post('https://x.test/api/auth/magic-link', { email: 'b@example.com' }))
    expect(a.status).toBe(b.status)
    expect(await a.text()).toBe(await b.text())
  }, 10_000)

  test('safeNextPath refuses every open-redirect shape', () => {
    // The value ends up inside a link we email, so a permissive check would
    // turn our own mail into a phishing carrier.
    expect(safeNextPath('/dashboard/events')).toBe('/dashboard/events')
    expect(safeNextPath('//evil.example/steal')).toBe('/dashboard')
    expect(safeNextPath('https://evil.example')).toBe('/dashboard')
    expect(safeNextPath('http://evil.example')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath('\\\\evil.example')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
  })
})

describe('POST /api/auth/resend-verification', () => {
  test('an already-confirmed account and an unknown one answer identically', async () => {
    // Otherwise the button is an oracle for "is this address registered and
    // still unverified", which is the most sensitive of the three.
    dispatchVerificationResend.mockResolvedValueOnce({
      outcome: 'no_account',
      reason: 'User already registered',
    })
    const confirmed = await resendPOST(
      post('https://x.test/api/auth/resend-verification', { email: 'done@example.com' }),
    )
    dispatchVerificationResend.mockResolvedValueOnce({
      outcome: 'no_account',
      reason: 'User not found',
    })
    const unknown = await resendPOST(
      post('https://x.test/api/auth/resend-verification', { email: 'nobody@example.com' }),
    )
    dispatchVerificationResend.mockResolvedValueOnce({ outcome: 'sent', messageId: 'm' })
    const pending = await resendPOST(
      post('https://x.test/api/auth/resend-verification', { email: 'pending@example.com' }),
    )

    const bodies = await Promise.all([confirmed.text(), unknown.text(), pending.text()])
    expect(new Set(bodies).size).toBe(1)
    expect(new Set([confirmed.status, unknown.status, pending.status]).size).toBe(1)
  }, 15_000)
})
