/**
 * THE authentication copy deck.
 *
 * Every sentence a user reads after an auth failure is written here, once. No
 * component may render a provider's own `error.message` again: on 2026-08-02
 * the forgot-password form put Supabase's raw "Error sending recovery email"
 * in front of the founder, which is neither honest about the cause (the
 * built-in mailer's 2-per-hour cap) nor actionable.
 *
 * Two rules govern the wording, and they are why this is a table and not a
 * `switch` scattered across six components.
 *
 * 1. NEVER BLAME THE USER FOR OUR CONFIGURATION. A disabled provider, an
 *    unverified sending domain and an exhausted mail quota are our faults. The
 *    copy says the method is unavailable and points at the one that works. It
 *    never implies the details were wrong.
 *
 * 2. NEVER LEAK WHETHER AN ACCOUNT EXISTS. OWASP Authentication Cheat Sheet:
 *    "an application must respond with a generic error message regardless of
 *    whether: The user ID or password was incorrect. The account does not
 *    exist. The account is locked or disabled." Credential failure therefore
 *    has exactly one message, and it is the same one whether the address is
 *    registered, unregistered, or registered through Google with no password
 *    at all.
 *
 * Australian English. No em dashes, no en dashes, no exclamation marks.
 */

/**
 * The failure classes the application distinguishes. Mapped from Supabase
 * `error_code` values (supabase.com/docs/guides/auth/debugging/error-codes),
 * OAuth `error` query and fragment parameters, and our own transport results.
 */
export type AuthFailureClass =
  | 'provider_disabled'
  | 'provider_declined'
  | 'link_expired'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'mail_transport_failed'
  | 'rate_limited'
  | 'weak_password'
  | 'same_password'
  | 'session_missing'
  | 'network'
  | 'unknown'

/**
 * The single hint shown alongside a credential failure.
 *
 * Brief 3.4: a user who signed up through Google must be told to use Google
 * rather than left guessing at a password that was never set. Brief 1.4: that
 * must not confirm the account exists. Both hold because the hint is
 * unconditional - it is shown on every credential failure, so it carries no
 * information about the address that was typed.
 *
 * Rendered only when the provider is actually enabled, so it can never point a
 * user at a button that is not on the page.
 */
export const OAUTH_ACCOUNT_HINT =
  'If you created your account with Google, use Continue with Google instead of a password.'

/**
 * OWASP's prescribed password-reset response, in EventLinqs voice. Shown for
 * every outcome that depends on whether the address is registered, so the
 * registered and unregistered cases are indistinguishable.
 */
export const RECOVERY_GENERIC_RESPONSE =
  'If that email address has an EventLinqs account, a password reset link is on its way. Check your inbox, and your spam folder.'

/** Same contract, for the magic-link request. */
export const MAGIC_LINK_GENERIC_RESPONSE =
  'If that email address has an EventLinqs account, a sign-in link is on its way. Check your inbox, and your spam folder.'

/** Same contract, for a verification resend. */
export const RESEND_VERIFICATION_GENERIC_RESPONSE =
  'If that account still needs verifying, a new link is on its way. Check your inbox, and your spam folder.'

const MESSAGES: Record<AuthFailureClass, string> = {
  // Our configuration fault. Name the method, offer the working one, take the
  // blame. Never "check your details".
  provider_disabled:
    'Google sign-in is unavailable right now. You can sign in with your email address and password below, and Google will be back shortly.',

  // The user backed out at the provider, or the provider refused. Their call,
  // so no apology and no alarm.
  provider_declined:
    'Google sign-in was cancelled before it finished. You can try again, or sign in with your email address and password.',

  link_expired:
    'That link has expired or has already been used. Links are single-use and last 24 hours. Request a fresh one below.',

  // ONE message for wrong password, unknown address, and OAuth-only account.
  invalid_credentials:
    'That email address and password combination did not match. Check them and try again.',

  email_not_confirmed:
    'This account still needs its email confirmed. Open the verification link we sent you, or request a new one.',

  // Our fault. Honest that it is us, honest that it is temporary.
  mail_transport_failed:
    'We could not send that email just now. This is a problem on our side, not with your account. Please try again in a few minutes.',

  rate_limited:
    'Too many attempts. Please wait a few minutes and try again.',

  weak_password: 'Password must be at least 8 characters.',

  same_password:
    'That is the same password you already have. Choose a different one.',

  session_missing:
    'We could not confirm your reset link. Request a fresh link and open it from the same browser.',

  network:
    'We could not reach EventLinqs. Check your connection and try again.',

  unknown:
    'Something went wrong on our side. Please try again, and contact us if it keeps happening.',
}

/** The sentence for a class. The only way copy reaches a user. */
export function authMessage(failure: AuthFailureClass): string {
  return MESSAGES[failure]
}

/**
 * Supabase / GoTrue `error_code` values, and the OAuth `error` parameter
 * values, mapped onto our classes. Anything unrecognised becomes `unknown`,
 * which renders a safe sentence rather than a provider string.
 */
const CODE_MAP: Record<string, AuthFailureClass> = {
  // Provider disabled. `validation_failed` is what the live authorize endpoint
  // returns today; the other two are the documented codes for the same state.
  oauth_provider_not_supported: 'provider_disabled',
  provider_disabled: 'provider_disabled',
  validation_failed: 'provider_disabled',

  access_denied: 'provider_declined',
  server_error: 'unknown',
  temporarily_unavailable: 'unknown',

  otp_expired: 'link_expired',
  email_link_invalid: 'link_expired',
  flow_state_expired: 'link_expired',
  flow_state_not_found: 'link_expired',
  bad_code_verifier: 'link_expired',

  invalid_credentials: 'invalid_credentials',
  user_not_found: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',

  over_email_send_rate_limit: 'mail_transport_failed',
  email_address_not_authorized: 'mail_transport_failed',
  email_provider_disabled: 'mail_transport_failed',

  over_request_rate_limit: 'rate_limited',
  request_timeout: 'network',

  weak_password: 'weak_password',
  same_password: 'same_password',

  session_not_found: 'session_missing',
  session_expired: 'session_missing',
}

/**
 * Classify a failure from whatever the caller has: a Supabase `error_code`, an
 * OAuth `error` parameter, or a raw message when neither is present.
 *
 * `access_denied` deliberately loses to a more specific `error_code`: GoTrue
 * sends `error=access_denied&error_code=otp_expired` for an expired link, and
 * "expired link" is the useful half of that pair.
 */
export function classifyAuthError(input: {
  errorCode?: string | null
  error?: string | null
  message?: string | null
  status?: number | null
}): AuthFailureClass {
  const code = input.errorCode?.trim().toLowerCase()
  if (code && CODE_MAP[code]) return CODE_MAP[code]

  const oauthError = input.error?.trim().toLowerCase()
  if (oauthError && CODE_MAP[oauthError]) return CODE_MAP[oauthError]

  const message = input.message?.toLowerCase() ?? ''
  if (message.includes('provider is not enabled') || message.includes('unsupported provider')) {
    return 'provider_disabled'
  }
  if (message.includes('invalid login credentials')) return 'invalid_credentials'
  if (message.includes('email not confirmed')) return 'email_not_confirmed'
  if (message.includes('expired') || message.includes('invalid or has expired')) return 'link_expired'
  if (message.includes('rate limit') || message.includes('too many')) {
    // The mailer cap and the request cap read differently to a user: one is our
    // outage, the other is their pace.
    return message.includes('email') ? 'mail_transport_failed' : 'rate_limited'
  }
  if (message.includes('error sending') || message.includes('smtp')) return 'mail_transport_failed'
  if (message.includes('password should be at least')) return 'weak_password'
  if (message.includes('failed to fetch') || message.includes('networkerror')) return 'network'

  if (input.status === 429) return 'rate_limited'
  if (input.status === 502 || input.status === 503) return 'mail_transport_failed'

  return 'unknown'
}

/** Classify, then render. The one call an auth component should ever make. */
export function authErrorMessage(input: Parameters<typeof classifyAuthError>[0]): string {
  return authMessage(classifyAuthError(input))
}

/**
 * Pull an auth failure out of a URL's query string AND its fragment.
 *
 * Both are required, and missing the fragment is what produced the dead end on
 * `/auth/reset-password`: GoTrue answers an expired recovery link with a 303 to
 *
 *   /auth/reset-password#error=access_denied&error_code=otp_expired&...
 *
 * A fragment never reaches the server, so the route handler saw nothing, the
 * client only ever read `getSession()`, and the page sat on "Validating your
 * reset link" indefinitely. Reading both is the fix.
 */
export function readAuthErrorFromUrl(input: {
  search?: string
  hash?: string
}): { failure: AuthFailureClass; description: string | null } | null {
  const sources = [input.search, input.hash]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => new URLSearchParams(s.replace(/^[?#]/, '')))

  for (const params of sources) {
    const error = params.get('error')
    const errorCode = params.get('error_code')
    if (!error && !errorCode) continue
    return {
      failure: classifyAuthError({ error, errorCode }),
      description: params.get('error_description'),
    }
  }
  return null
}
