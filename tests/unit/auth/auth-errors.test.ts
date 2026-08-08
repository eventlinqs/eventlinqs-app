import { describe, expect, test } from 'vitest'
import {
  ALL_FAILURE_CLASSES,
  authErrorMessage,
  authMessage,
  classifyAuthError,
  rateLimitedMessage,
  readAuthErrorFromUrl,
  MAGIC_LINK_GENERIC_RESPONSE,
  OAUTH_ACCOUNT_HINT,
  RECOVERY_GENERIC_RESPONSE,
  RESEND_VERIFICATION_GENERIC_RESPONSE,
  type AuthFailureClass,
} from '@/lib/auth/auth-errors'

/**
 * Locks Phase 1 in place: no user ever sees a raw provider error, a disabled
 * provider is never blamed on the user, and the reset response never reveals
 * whether an account exists.
 */

// Derived from the MESSAGES table, never hand-listed. A literal array here let
// a newly added class skip every rule below while the suite stayed green; see
// ALL_FAILURE_CLASSES in auth-errors.ts.
const ALL_CLASSES: AuthFailureClass[] = ALL_FAILURE_CLASSES

describe('classifyAuthError', () => {
  test('the live production JSON body classifies as a disabled provider', () => {
    // The exact body the founder saw on 2026-08-02.
    const body = {
      code: 400,
      error_code: 'validation_failed',
      msg: 'Unsupported provider: provider is not enabled',
    }
    expect(classifyAuthError({ errorCode: body.error_code, message: body.msg })).toBe(
      'provider_disabled',
    )
  })

  test('both documented provider-disabled codes classify the same way', () => {
    expect(classifyAuthError({ errorCode: 'oauth_provider_not_supported' })).toBe('provider_disabled')
    expect(classifyAuthError({ errorCode: 'provider_disabled' })).toBe('provider_disabled')
  })

  test('the expired-link pair prefers the specific code over access_denied', () => {
    // GoTrue sends both. "Your link expired" is the useful half.
    expect(classifyAuthError({ error: 'access_denied', errorCode: 'otp_expired' })).toBe(
      'link_expired',
    )
  })

  test('access_denied alone is a user cancellation, not an expiry', () => {
    expect(classifyAuthError({ error: 'access_denied' })).toBe('provider_declined')
  })

  test('the built-in mailer cap classifies as our transport failure, not the user', () => {
    expect(classifyAuthError({ errorCode: 'over_email_send_rate_limit' })).toBe(
      'mail_transport_failed',
    )
    // The raw string the forgot-password form used to render verbatim.
    expect(classifyAuthError({ message: 'Error sending recovery email' })).toBe(
      'mail_transport_failed',
    )
  })

  test('an email rate limit is a transport failure but a request rate limit is not', () => {
    expect(classifyAuthError({ message: 'email rate limit exceeded' })).toBe('mail_transport_failed')
    expect(classifyAuthError({ message: 'too many requests' })).toBe('rate_limited')
  })

  test('unknown codes never leak, they fall back to a safe class', () => {
    expect(classifyAuthError({ errorCode: 'some_code_invented_in_2029' })).toBe('unknown')
    expect(classifyAuthError({ message: 'PostgresError 42501: permission denied for table users' })).toBe(
      'unknown',
    )
  })

  test('http status is the last resort', () => {
    expect(classifyAuthError({ status: 429 })).toBe('rate_limited')
    expect(classifyAuthError({ status: 502 })).toBe('mail_transport_failed')
  })
})

describe('the copy deck', () => {
  test('every failure class has a sentence', () => {
    for (const c of ALL_CLASSES) {
      expect(authMessage(c).length).toBeGreaterThan(20)
    }
  })

  test('no message contains an em dash, an en dash, or an exclamation mark', () => {
    const all = [
      ...ALL_CLASSES.map(authMessage),
      RECOVERY_GENERIC_RESPONSE,
      MAGIC_LINK_GENERIC_RESPONSE,
      RESEND_VERIFICATION_GENERIC_RESPONSE,
      OAUTH_ACCOUNT_HINT,
    ]
    for (const m of all) {
      expect(m, `banned punctuation in: ${m}`).not.toMatch(/[–—!]/)
    }
  })

  test('no message names a competitor', () => {
    const banned = /ticketmaster|eventbrite|humanitix|ticketek|dice/i
    for (const c of ALL_CLASSES) {
      expect(authMessage(c)).not.toMatch(banned)
    }
  })

  test('no message exposes an implementation detail to the user', () => {
    // Supabase, GoTrue, SMTP, Resend and stack-trace nouns are ours to log,
    // never to render.
    const leaky = /supabase|gotrue|smtp|resend|postgres|jwt|token_hash|500|null|undefined/i
    for (const c of ALL_CLASSES) {
      expect(authMessage(c), `leaks internals: ${authMessage(c)}`).not.toMatch(leaky)
    }
  })

  test('a disabled provider blames us and offers the working alternative', () => {
    const m = authMessage('provider_disabled')
    expect(m).toContain('unavailable')
    expect(m.toLowerCase()).toContain('email address and password')
    // Must never imply the user got something wrong.
    expect(m.toLowerCase()).not.toContain('check your details')
    expect(m.toLowerCase()).not.toContain('incorrect')
  })

  test('a transport failure says it is our side, not the account', () => {
    const m = authMessage('mail_transport_failed')
    expect(m.toLowerCase()).toContain('our side')
    expect(m.toLowerCase()).toContain('not with your account')
  })

  test('credential failure is one message for every account state', () => {
    // OWASP: the same response whether the password was wrong, the account does
    // not exist, or the account is disabled.
    const m = authMessage('invalid_credentials')
    expect(m.toLowerCase()).not.toMatch(/no account|not found|does not exist|no user|unregistered/)
    expect(m.toLowerCase()).not.toMatch(/wrong password|incorrect password/)
  })
})

describe('enumeration-safe responses', () => {
  test('the recovery response is conditional and names no address', () => {
    expect(RECOVERY_GENERIC_RESPONSE.toLowerCase()).toContain('if that email address has')
    expect(RECOVERY_GENERIC_RESPONSE.toLowerCase()).not.toContain('we sent')
  })

  test('every request response uses the same conditional construction', () => {
    for (const m of [
      RECOVERY_GENERIC_RESPONSE,
      MAGIC_LINK_GENERIC_RESPONSE,
      RESEND_VERIFICATION_GENERIC_RESPONSE,
    ]) {
      expect(m.toLowerCase().startsWith('if that')).toBe(true)
    }
  })

  test('the OAuth hint does not confirm an account exists', () => {
    expect(OAUTH_ACCOUNT_HINT.toLowerCase().startsWith('if you created')).toBe(true)
    expect(OAUTH_ACCOUNT_HINT).toContain('Continue with Google')
  })
})

describe('readAuthErrorFromUrl', () => {
  test('reads an error out of the FRAGMENT, which never reaches the server', () => {
    // Captured verbatim from production on 2026-08-02.
    const hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    const found = readAuthErrorFromUrl({ hash })
    expect(found?.failure).toBe('link_expired')
    expect(found?.description).toBe('Email link is invalid or has expired')
  })

  test('reads an error out of the query string', () => {
    const found = readAuthErrorFromUrl({ search: '?error=server_error&error_code=provider_disabled' })
    expect(found?.failure).toBe('provider_disabled')
  })

  test('the query string wins when both carry an error', () => {
    const found = readAuthErrorFromUrl({
      search: '?error_code=over_email_send_rate_limit',
      hash: '#error_code=otp_expired',
    })
    expect(found?.failure).toBe('mail_transport_failed')
  })

  test('returns null for a clean URL so the banner never renders on the happy path', () => {
    expect(readAuthErrorFromUrl({ search: '?redirect=/dashboard', hash: '' })).toBeNull()
    expect(readAuthErrorFromUrl({})).toBeNull()
  })

  test('an access_token fragment from a successful implicit flow is not an error', () => {
    expect(readAuthErrorFromUrl({ hash: '#access_token=abc&type=recovery' })).toBeNull()
  })
})

describe('authErrorMessage end to end', () => {
  test('turns the live production failure into a rendered sentence', () => {
    const message = authErrorMessage({
      errorCode: 'validation_failed',
      message: 'Unsupported provider: provider is not enabled',
    })
    expect(message).toBe(authMessage('provider_disabled'))
    // The provider's own words never survive.
    expect(message).not.toContain('Unsupported provider')
    expect(message).not.toContain('provider is not enabled')
  })
})

/**
 * The 2026-08-09 launch blocker: the founder could not create an organiser
 * account and was shown the `unknown` sentence, which names no cause and
 * offers no next step.
 *
 * Root cause, reproduced against the TEST project the same day:
 * admin.generateLink({type:'signup'}) on an already-confirmed address answers
 *
 *   status 422   code 'email_exists'
 *   message "A user with this email address has already been registered"
 *
 * and the route substring matched 'already registered', which that string does
 * NOT contain, because of the word "been". Every duplicate signup fell through
 * to `unknown`.
 *
 * These lock the fix in from both directions: the exact live payload must
 * classify, and no case may collapse back into `unknown`.
 */
describe('signup failure classes (the 2026-08-09 blocker)', () => {
  // The verbatim payload observed from GoTrue. If this ever stops classifying,
  // the founder's bug is back.
  const LIVE_DUPLICATE = {
    errorCode: 'email_exists',
    status: 422,
    message: 'A user with this email address has already been registered',
  }

  test('the exact live duplicate payload classifies as email_exists', () => {
    expect(classifyAuthError(LIVE_DUPLICATE)).toBe('email_exists')
  })

  test('the live duplicate never renders the generic sentence', () => {
    expect(authErrorMessage(LIVE_DUPLICATE)).not.toBe(authMessage('unknown'))
  })

  test('the duplicate message names both ways out: sign in and reset', () => {
    const m = authMessage('email_exists')
    expect(m.toLowerCase()).toContain('sign in')
    expect(m.toLowerCase()).toContain('reset your password')
  })

  test('the old substring test is exactly what failed, and is no longer relied on', () => {
    // Documents the defect so nobody reintroduces the cheap check. The three
    // substrings the route used to test for are all absent from the real
    // string; only the word "been" separates them.
    const real = LIVE_DUPLICATE.message.toLowerCase()
    expect(real).not.toContain('already registered')
    expect(real).not.toContain('already exists')
    expect(real).not.toContain('user already')
    // And yet it still classifies, because we read the code.
    expect(classifyAuthError(LIVE_DUPLICATE)).toBe('email_exists')
  })

  test('a duplicate still classifies when GoTrue sends no code at all', () => {
    // The message fallback is gap tolerant on purpose: one extra word is what
    // broke the last one.
    expect(classifyAuthError({ message: LIVE_DUPLICATE.message })).toBe('email_exists')
    expect(classifyAuthError({ message: 'User already registered' })).toBe('email_exists')
    expect(classifyAuthError({ message: 'That email address is already in use' })).toBe(
      'email_exists',
    )
    expect(classifyAuthError({ message: 'This email is already taken' })).toBe('email_exists')
  })

  test('user_already_exists is the same class', () => {
    expect(classifyAuthError({ errorCode: 'user_already_exists' })).toBe('email_exists')
  })

  test('an address GoTrue refuses is told to the person, not swallowed', () => {
    expect(classifyAuthError({ errorCode: 'email_address_invalid' })).toBe('email_invalid')
    expect(authMessage('email_invalid')).not.toBe(authMessage('unknown'))
  })

  test('every signup failure a person can reach has its own sentence', () => {
    // No two of these may collapse into the same words, and none may be the
    // generic one. This is the regression the brief asks for: one test per
    // case so none falls back into "Something went wrong on our side".
    const reachable: AuthFailureClass[] = [
      'email_exists',
      'email_invalid',
      'weak_password',
      'rate_limited',
      'mail_transport_failed',
      'network',
    ]
    const seen = new Map<string, AuthFailureClass>()
    for (const c of reachable) {
      const m = authMessage(c)
      expect(m, `${c} fell back to the generic sentence`).not.toBe(authMessage('unknown'))
      expect(seen.has(m), `${c} duplicates ${seen.get(m)}`).toBe(false)
      seen.set(m, c)
    }
  })

  test('the generic sentence still says nothing was created, and offers a way out', () => {
    const m = authMessage('unknown').toLowerCase()
    // The version this replaced ended at "contact us if it keeps happening"
    // with no route and no statement of what happened to the account.
    expect(m).toContain('no account was created')
    expect(m).toContain('contact us')
  })
})

describe('rateLimitedMessage', () => {
  // Eventbrite's troubleshooting guide is the bar: "Wait six minutes to try
  // again, or reset your password." A named wait, not "a few minutes".
  test('names the wait in seconds under a minute', () => {
    expect(rateLimitedMessage(45)).toContain('45 seconds')
  })

  test('names the wait in minutes above a minute, singular and plural', () => {
    expect(rateLimitedMessage(60)).toContain('1 minute')
    expect(rateLimitedMessage(60)).not.toContain('1 minutes')
    expect(rateLimitedMessage(600)).toContain('10 minutes')
  })

  test('falls back to the table sentence when the server gave no wait', () => {
    expect(rateLimitedMessage(undefined)).toBe(authMessage('rate_limited'))
    expect(rateLimitedMessage(0)).toBe(authMessage('rate_limited'))
    expect(rateLimitedMessage(null)).toBe(authMessage('rate_limited'))
  })

  test('never renders the raw class token a limiter body carries', () => {
    // The signup form used to read `payload.error`, which the 429 body sets to
    // the literal string 'rate_limited', and printed it into the red box.
    for (const s of [undefined, 0, 30, 600]) {
      expect(rateLimitedMessage(s)).not.toContain('rate_limited')
    }
  })
})
