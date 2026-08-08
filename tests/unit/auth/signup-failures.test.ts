import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextResponse } from 'next/server'

/**
 * REGRESSION LOCK for the production signup failure of 2026-08-08.
 *
 * The founder, signing up as an organiser on production in a clean incognito
 * window with an address that already had an account, was answered with
 *
 *   "Something went wrong on our side. Please try again, and contact us if it
 *    keeps happening."
 *
 * The cause, from the production log at 20:01:08 UTC:
 *
 *   [auth/signup] generateLink failed
 *     { reason: 'A user with this email address has already been registered' }
 *
 * The route decided "already registered" by testing that message for the
 * substrings 'already registered', 'already exists' and 'user already'. GoTrue's
 * actual wording, "already BEEN registered", contains none of them, so the
 * branch that says "you already have an account" was dead code and the top of
 * the acquisition funnel answered its single most common failure with a sentence
 * that named no cause and offered nowhere to go.
 *
 * These tests pin two properties, per failure case:
 *
 *   1. Each case renders ITS OWN sentence, and that sentence tells the person
 *      which of the four things to do: different email, different password,
 *      wait, or contact us.
 *   2. NO case renders the generic sentence. That is asserted per test and again
 *      as a sweep at the bottom, so a new unclassified branch cannot quietly
 *      collapse back into it.
 */

const generateLink = vi.fn()
const deleteUser = vi.fn()
const createAdminClient = vi.fn()
const sendSignupConfirmation = vi.fn()
const applyRateLimit = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

vi.mock('@/lib/email/auth-emails', () => ({
  sendSignupConfirmation: (...a: unknown[]) => sendSignupConfirmation(...a),
}))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}))

vi.mock('@/lib/analytics/plausible', () => ({
  trackEmailCapturedAfterRenderServer: vi.fn(),
}))

vi.mock('@/lib/consent/record', () => ({
  recordPlatformDigestConsent: vi.fn(),
}))

const { POST } = await import('@/app/api/auth/signup/route')
const { authMessage } = await import('@/lib/auth/auth-errors')

const GENERIC = authMessage('unknown')

/** The exact error object the live TEST project returns for a taken address. */
const EMAIL_EXISTS = {
  name: 'AuthApiError',
  status: 422,
  code: 'email_exists',
  message: 'A user with this email address has already been registered',
}

/** The exact error the live TEST project returns below the password policy. */
const WEAK_PASSWORD = {
  name: 'AuthWeakPasswordError',
  status: 422,
  code: 'weak_password',
  message: 'Password should be at least 6 characters.',
}

type Body = {
  ok: boolean
  failure?: string
  error?: string
  field?: string | null
  retryAfterSeconds?: number
}

/** Every sentence this suite puts in front of a person, for the final sweep. */
const shown: string[] = []

async function post(
  overrides: Partial<{ fullName: string; email: string; password: string; role: string }> = {},
): Promise<{ status: number; body: Body }> {
  const request = new Request('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({
      fullName: 'Test Organiser',
      email: 'organiser@example.com',
      password: 'ValidPassword123',
      role: 'organiser',
      ...overrides,
    }),
  })
  // The handler reads request.json(), request.cookies and headers; a Request
  // with a cookies shim satisfies all three without pulling in a server runtime.
  Object.defineProperty(request, 'cookies', {
    value: { get: () => undefined },
    configurable: true,
  })
  const res = await POST(request as never)
  const body = (await res.json()) as Body
  if (body.error) shown.push(body.error)
  return { status: res.status, body }
}

beforeEach(() => {
  applyRateLimit.mockResolvedValue(null)
  createAdminClient.mockReturnValue({
    auth: { admin: { generateLink, deleteUser } },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      update: () => ({ eq: async () => ({}) }),
    }),
  })
  generateLink.mockResolvedValue({
    data: { user: { id: 'user_1' }, properties: { hashed_token: 'token_1' } },
    error: null,
  })
  sendSignupConfirmation.mockResolvedValue({ id: 'msg_1' })
  deleteUser.mockResolvedValue({})
})

afterEach(() => vi.clearAllMocks())

describe('the email is already registered', () => {
  test('the real GoTrue error is recognised, and is NOT the generic sentence', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: EMAIL_EXISTS })
    const { status, body } = await post()

    expect(body.failure).toBe('email_exists')
    expect(status).toBe(409)
    expect(body.error).not.toBe(GENERIC)
  })

  test('the sentence says the account exists and names the two ways in', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: EMAIL_EXISTS })
    const { body } = await post()

    expect(body.error).toContain('already has an EventLinqs account')
    expect(body.error).toContain('Sign in')
    expect(body.error?.toLowerCase()).toContain('reset your password')
  })

  test('it is attached to the email field, which is the input to change', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: EMAIL_EXISTS })
    const { body } = await post()
    expect(body.field).toBe('email')
  })

  test('THE 2026-08-08 BUG: substring matching would have missed this wording', () => {
    // Kept as an executable record of why prose is not an API. If any of these
    // ever becomes true, someone has reintroduced message matching.
    const lower = EMAIL_EXISTS.message.toLowerCase()
    expect(lower.includes('already registered')).toBe(false)
    expect(lower.includes('already exists')).toBe(false)
    expect(lower.includes('user already')).toBe(false)
  })
})

describe('the password fails the policy', () => {
  test('our own 8-character floor is refused before any network call', async () => {
    const { status, body } = await post({ password: 'short' })

    expect(status).toBe(400)
    expect(body.failure).toBe('weak_password')
    expect(body.field).toBe('password')
    expect(body.error).not.toBe(GENERIC)
    expect(generateLink).not.toHaveBeenCalled()
  })

  test("GoTrue's own policy rejection lands on the password, not the generic sentence", async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: WEAK_PASSWORD })
    const { status, body } = await post()

    expect(status).toBe(400)
    expect(body.failure).toBe('weak_password')
    expect(body.field).toBe('password')
    expect(body.error).not.toBe(GENERIC)
    expect(body.error).toContain('8 characters')
  })
})

describe('the rate limiter fired', () => {
  test('the person is never shown the machine token "rate_limited"', async () => {
    // What the shared limiter actually returns. Before the fix the form printed
    // payload.error verbatim, so this exact string reached the screen.
    applyRateLimit.mockResolvedValueOnce(
      NextResponse.json(
        { ok: false, error: 'rate_limited', message: 'Too many requests.', retryAfterSeconds: 480 },
        { status: 429, headers: { 'Retry-After': '480' } },
      ),
    )
    const { status, body } = await post()

    expect(status).toBe(429)
    expect(body.error).not.toBe('rate_limited')
    expect(body.failure).toBe('rate_limited')
  })

  test('it states the real wait, taken from Retry-After', async () => {
    applyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '480' } }),
    )
    const { body } = await post()

    expect(body.error).toContain('8 minutes')
    expect(body.retryAfterSeconds).toBe(480)
    expect(body.error).not.toBe(GENERIC)
  })

  test('a missing Retry-After still produces a usable sentence', async () => {
    applyRateLimit.mockResolvedValueOnce(
      NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 }),
    )
    const { body } = await post()

    expect(body.error).toContain('wait')
    expect(body.error).not.toBe(GENERIC)
  })
})

describe('the verification email could not be sent', () => {
  test('it is named as our transport, not as a problem with the account', async () => {
    sendSignupConfirmation.mockRejectedValueOnce(new Error('Resend 401 unauthorised'))
    const { status, body } = await post()

    expect(status).toBe(502)
    expect(body.failure).toBe('mail_transport_failed')
    expect(body.error).toContain('problem on our side')
    expect(body.error).not.toBe(GENERIC)
  })

  test('the half-created account is rolled back so the retry can succeed', async () => {
    sendSignupConfirmation.mockRejectedValueOnce(new Error('Resend down'))
    await post()
    expect(deleteUser).toHaveBeenCalledWith('user_1')
  })

  test("the transport's own error string never reaches the browser", async () => {
    sendSignupConfirmation.mockRejectedValueOnce(new Error('Resend 401 unauthorised'))
    const { body } = await post()
    expect(body.error).not.toContain('Resend')
    expect(body.error).not.toContain('401')
  })
})

describe('Supabase was unreachable', () => {
  test('a thrown transport failure is our outage, not the generic sentence', async () => {
    generateLink.mockRejectedValueOnce(new TypeError('fetch failed'))
    const { status, body } = await post()

    expect(status).toBe(503)
    expect(body.failure).toBe('service_unavailable')
    expect(body.error).toContain('not with your details')
    expect(body.error).not.toBe(GENERIC)
  })

  test('a retryable fetch error carrying status 0 is our outage too', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    })
    const { status, body } = await post()

    expect(status).toBe(503)
    expect(body.failure).toBe('service_unavailable')
    expect(body.error).not.toBe(GENERIC)
  })

  test('a 500 from GoTrue is our outage', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { status: 500, code: 'unexpected_failure', message: 'Internal error' },
    })
    const { status, body } = await post()

    expect(status).toBe(503)
    expect(body.failure).toBe('service_unavailable')
    expect(body.error).not.toBe(GENERIC)
  })

  test('a missing service-role key is our misconfiguration, and says so', async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('supabaseKey is required.')
    })
    const { status, body } = await post()

    expect(status).toBe(503)
    expect(body.failure).toBe('service_unavailable')
    expect(body.error).not.toBe(GENERIC)
    expect(body.error).not.toContain('supabaseKey')
  })
})

describe('the details did not validate', () => {
  test('a malformed email names the email field', async () => {
    const { status, body } = await post({ email: 'not-an-email' })

    expect(status).toBe(400)
    expect(body.failure).toBe('invalid_email')
    expect(body.field).toBe('email')
    expect(body.error).not.toBe(GENERIC)
  })

  test('a blank name names the name field', async () => {
    const { status, body } = await post({ fullName: '' })

    expect(status).toBe(400)
    expect(body.failure).toBe('missing_name')
    expect(body.field).toBe('fullName')
    expect(body.error).not.toBe(GENERIC)
  })
})

describe('anything else GoTrue declines', () => {
  test('an unmodelled 4xx asserts no cause but offers every way out', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { status: 400, code: 'some_future_gotrue_code', message: 'Something we have never seen' },
    })
    const { status, body } = await post()

    expect(status).toBe(400)
    expect(body.failure).toBe('signup_rejected')
    expect(body.error).not.toBe(GENERIC)
    // The three routes out, so this branch can never be a dead end either.
    expect(body.error).toContain('email address')
    expect(body.error).toContain('password')
    expect(body.error).toContain('sign in')
  })

  test('the provider string never reaches the browser', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { status: 400, code: 'x', message: 'GoTrue internal detail 12345' },
    })
    const { body } = await post()
    expect(body.error).not.toContain('GoTrue')
    expect(body.error).not.toContain('12345')
  })

  test('a minted link with no token is our failure, and the account is removed', async () => {
    generateLink.mockResolvedValueOnce({
      data: { user: { id: 'user_2' }, properties: {} },
      error: null,
    })
    const { status, body } = await post()

    expect(status).toBe(503)
    expect(body.failure).toBe('service_unavailable')
    expect(body.error).not.toBe(GENERIC)
    expect(deleteUser).toHaveBeenCalledWith('user_2')
  })
})

describe('the happy path still works', () => {
  test('a fresh address is created and the confirmation is sent', async () => {
    const { status, body } = await post()

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(sendSignupConfirmation).toHaveBeenCalledTimes(1)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('the sweep', () => {
  test('not one failure in this suite showed the generic sentence', () => {
    // Every message this file put in front of a person, checked in one place.
    expect(shown.length).toBeGreaterThan(15)
    expect(shown).not.toContain(GENERIC)
  })

  test('every sentence shown tells the person what to do next', () => {
    // Wait, try again, change something, or contact us. A failure sentence with
    // none of these is the defect this whole file exists to prevent.
    const actionable = /try again|sign in|check|wait|choose|enter|contact/i
    const useless = shown.filter((message) => !actionable.test(message))
    expect(useless).toEqual([])
  })
})
