import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * REGRESSION LOCK for the enumeration leak the live journey walk caught on
 * 2026-08-03.
 *
 * The first version of this module decided "does this account exist" by
 * substring-matching `error.message`. GoTrue answers a missing account with
 * `message: "User with this email not found"`, and the list checked for
 * `"user not found"`, which is not a substring of it. Result: an unregistered
 * address got a 502 while a registered one got a 200, an enumeration oracle
 * built by the very code meant to remove one.
 *
 * Every unit test passed. It took walking the real flow against a real project
 * to find, which is the entire argument for the journey harness.
 *
 * These tests pin the structured rule: 4xx is account-shaped, 5xx and network
 * failures are ours.
 */

const generateLink = vi.fn()
const sendPasswordReset = vi.fn()
const sendMagicLink = vi.fn()
const sendSignupConfirmation = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink: (...a: unknown[]) => generateLink(...a) } } }),
}))

vi.mock('@/lib/email/auth-emails', () => ({
  sendPasswordReset: (...a: unknown[]) => sendPasswordReset(...a),
  sendMagicLink: (...a: unknown[]) => sendMagicLink(...a),
  sendSignupConfirmation: (...a: unknown[]) => sendSignupConfirmation(...a),
}))

const { dispatchPasswordReset, dispatchMagicLink, dispatchVerificationResend } = await import(
  '@/lib/auth/dispatch-auth-link'
)

const ORIGIN = 'https://www.eventlinqs.com.au'

beforeEach(() => {
  sendPasswordReset.mockResolvedValue({ id: 'msg_1' })
  sendMagicLink.mockResolvedValue({ id: 'msg_2' })
  sendSignupConfirmation.mockResolvedValue({ id: 'msg_3' })
})

afterEach(() => vi.clearAllMocks())

/** The exact error object the live TEST project returns for a missing account. */
const USER_NOT_FOUND = {
  name: 'AuthApiError',
  status: 404,
  code: 'user_not_found',
  message: 'User with this email not found',
}

describe('the 2026-08-03 enumeration leak', () => {
  test('the real GoTrue missing-account error is account-shaped, not a transport failure', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: USER_NOT_FOUND })
    const result = await dispatchPasswordReset({ email: 'nobody@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('no_account')
  })

  test('no email is attempted when there is no account', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: USER_NOT_FOUND })
    await dispatchPasswordReset({ email: 'nobody@example.com', origin: ORIGIN })
    expect(sendPasswordReset).not.toHaveBeenCalled()
  })

  test('ANY unrecognised 4xx defaults to the enumeration-safe side', async () => {
    // The whole point of the fix: a wording change or a new GoTrue code must
    // not silently reopen the oracle.
    for (const error of [
      { status: 400, code: 'validation_failed', message: 'something new in 2029' },
      { status: 403, code: 'not_admin', message: 'wording nobody predicted' },
      { status: 422, code: 'unprocessable', message: '' },
      { status: 404, code: undefined, message: undefined },
    ]) {
      generateLink.mockResolvedValueOnce({ data: null, error })
      const result = await dispatchPasswordReset({ email: 'x@example.com', origin: ORIGIN })
      expect(result.outcome, `status ${error.status} should be account-shaped`).toBe('no_account')
    }
  })

  test('a 5xx IS reported as our failure, so a real outage is not hidden', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { status: 503, code: 'service_unavailable', message: 'upstream down' },
    })
    const result = await dispatchPasswordReset({ email: 'x@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('send_failed')
  })

  test('an error with no HTTP status at all is our failure, not an absent account', async () => {
    generateLink.mockResolvedValueOnce({ data: null, error: { message: 'fetch failed' } })
    const result = await dispatchPasswordReset({ email: 'x@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('send_failed')
  })
})

describe('the happy path', () => {
  test('a minted link is emailed and reported sent', async () => {
    generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: 'abc123' } },
      error: null,
    })
    const result = await dispatchPasswordReset({ email: 'real@example.com', origin: ORIGIN })
    expect(result).toEqual({ outcome: 'sent', messageId: 'msg_1' })
  })

  test('the emailed URL points at OUR confirm route, never a raw GoTrue action_link', async () => {
    generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: 'abc123' } },
      error: null,
    })
    await dispatchPasswordReset({ email: 'real@example.com', origin: ORIGIN })
    const { resetUrl } = sendPasswordReset.mock.calls[0][0] as { resetUrl: string }
    expect(resetUrl).toBe(
      `${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery&next=%2Fauth%2Freset-password`,
    )
    // The implicit-flow action_link returns the session in the fragment, which
    // a server route can never read.
    expect(resetUrl).not.toContain('/auth/v1/verify')
  })

  test('a transport throw AFTER minting is a genuine send failure', async () => {
    generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: 'abc' } },
      error: null,
    })
    sendPasswordReset.mockRejectedValueOnce(new Error('Resend: domain is not verified'))
    const result = await dispatchPasswordReset({ email: 'real@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('send_failed')
    expect((result as { reason: string }).reason).toContain('not verified')
  })

  test('a missing hashed_token is our failure, not an absent account', async () => {
    generateLink.mockResolvedValueOnce({ data: { properties: {} }, error: null })
    const result = await dispatchPasswordReset({ email: 'real@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('send_failed')
  })
})

describe('token types', () => {
  test('password reset mints a recovery token and lands on the reset page', async () => {
    generateLink.mockResolvedValueOnce({ data: { properties: { hashed_token: 't' } }, error: null })
    await dispatchPasswordReset({ email: 'a@example.com', origin: ORIGIN })
    expect(generateLink.mock.calls[0][0]).toMatchObject({ type: 'recovery', email: 'a@example.com' })
  })

  test('magic link mints a magiclink token', async () => {
    generateLink.mockResolvedValueOnce({ data: { properties: { hashed_token: 't' } }, error: null })
    await dispatchMagicLink({ email: 'a@example.com', origin: ORIGIN })
    expect(generateLink.mock.calls[0][0]).toMatchObject({ type: 'magiclink' })
  })

  test('verification resend mints a magiclink token, because signup needs a password', async () => {
    // generateLink({type:'signup'}) requires the user's password, which is
    // available exactly once and never again. Verifying a magiclink confirms an
    // unconfirmed address and signs the user in, which is the same outcome.
    generateLink.mockResolvedValueOnce({ data: { properties: { hashed_token: 't' } }, error: null })
    await dispatchVerificationResend({ email: 'a@example.com', origin: ORIGIN })
    expect(generateLink.mock.calls[0][0]).toMatchObject({ type: 'magiclink' })
    expect(sendSignupConfirmation).toHaveBeenCalled()
  })

  test('an already-confirmed account gets the generic answer, not an oracle', async () => {
    generateLink.mockResolvedValueOnce({
      data: null,
      error: { status: 422, code: 'email_exists', message: 'User already registered' },
    })
    const result = await dispatchVerificationResend({ email: 'done@example.com', origin: ORIGIN })
    expect(result.outcome).toBe('no_account')
  })
})
