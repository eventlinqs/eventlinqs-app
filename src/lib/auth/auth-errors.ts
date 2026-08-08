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
  // Registration-only classes. See classifySignupError below for why signup
  // needs its own vocabulary and its own classifier.
  | 'email_exists'
  | 'invalid_email'
  | 'missing_name'
  | 'password_too_long'
  | 'name_too_long'
  | 'signup_rejected'
  | 'service_unavailable'
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

  // States the rule AND what to do about it. It read "Password must be at least
  // 8 characters." until the signup sweep, which is a fact rather than an
  // instruction: correct, and still leaves a person looking at a red field
  // working out what is being asked of them. Shared with the reset-password
  // form, where the same instruction applies.
  weak_password: 'Password must be at least 8 characters. Choose a longer one and try again.',

  same_password:
    'That is the same password you already have. Choose a different one.',

  session_missing:
    'We could not confirm your reset link. Request a fresh link and open it from the same browser.',

  network:
    'We could not reach EventLinqs. Check your connection and try again.',

  // REGISTRATION. Every sentence below names one cause and hands the person one
  // thing to do next. The rule they exist to enforce: a signup failure must
  // always answer "so do I try a different email, a different password, wait,
  // or get help", because a stranger who cannot answer that question leaves.
  //
  // On saying this out loud: see classifySignupError for the enumeration
  // reasoning. In short, a signup form that creates accounts already reveals
  // whether an address is taken, through success versus failure and through
  // response time. Wording it vaguely closes nothing and costs the person their
  // way back in.
  email_exists:
    'That email address already has an EventLinqs account. Sign in instead, or reset your password if you have forgotten it.',

  invalid_email: 'That email address does not look right. Check it and try again.',

  missing_name: 'Enter your full name so organisers and attendees know who you are.',

  // Both bounds need their own sentence. Found by walking the deployed preview:
  // the schema caps the password at 128 and the name at 120, and both ceilings
  // were answered by the floor's message, so a person who pasted a long
  // passphrase was told to "choose a longer one". A message that gives the
  // wrong instruction is worse than one that gives none.
  password_too_long: 'Password must be 128 characters or fewer. Shorten it and try again.',

  name_too_long: 'That name is too long. Shorten it to 120 characters or fewer and try again.',

  // The honest answer when GoTrue declines and we cannot name the reason: no
  // cause is asserted, but all three routes out are offered. It replaces the
  // sentence that used to catch this case, which offered none.
  signup_rejected:
    'We could not create an account with those details. Check your email address and password, or sign in if you already have an account.',

  // Ours, and said so. Distinct from mail_transport_failed: that one means the
  // account service answered and the mail did not go; this one means the
  // account service never answered.
  service_unavailable:
    'We could not reach our account service just now. This is a problem on our side, not with your details. Please try again in a moment.',

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
 * REGISTRATION FAILURES. Why signup does not reuse `classifyAuthError`.
 *
 * THE BUG THIS REPLACES (production, 2026-08-08 20:01:08 UTC). `/api/auth/signup`
 * decided "does this address already have an account" by testing `error.message`
 * for the substrings 'already registered', 'already exists' and 'user already'.
 * GoTrue answers
 *
 *   { name: 'AuthApiError', status: 422, code: 'email_exists',
 *     message: 'A user with this email address has already been registered' }
 *
 * and "already been registered" contains none of the three. So the one branch
 * written to say "you already have an account" was unreachable, and the founder,
 * signing up as an organiser on his own platform with an address that already
 * had an account, was told "Something went wrong on our side. Please try again,
 * and contact us if it keeps happening." That is the top of the acquisition
 * funnel answering the single most common signup failure with a sentence that
 * names no cause and offers no way forward.
 *
 * It is the SECOND time prose matching has produced exactly this class of bug in
 * this codebase: `dispatch-auth-link.ts` records the same failure on 2026-08-03,
 * where checking for "user not found" against GoTrue's "User with this email not
 * found" built an enumeration oracle. Prose is not an API. Both now key on the
 * structured `code` and `status`.
 *
 * THE ENUMERATION QUESTION, ANSWERED RATHER THAN SPLIT. OWASP's Authentication
 * Cheat Sheet asks registration to answer generically, its example of a correct
 * response being "A link to activate your account has been emailed to the
 * address provided" in place of "This user ID is already in use". Taken alone
 * that argues for keeping the vague sentence.
 *
 * It does not apply here, for a reason worth stating plainly: a signup form that
 * CREATES ACCOUNTS already discloses whether an address is taken, whatever the
 * wording, because the attempt either succeeds or does not. Vague copy does not
 * close that oracle. It only removes the answer from the one person who has a
 * legitimate use for it, the account's actual owner, standing in front of a
 * screen wondering whether to try another email or another password. The
 * disclosure is paid for either way; only the honesty differs.
 *
 * The oracle is genuinely closed by ONE design, the one Eventbrite now runs:
 * collect the email, always answer "check your email", and vary only what the
 * message says, which only the mailbox owner can read. That is a flow change,
 * not a copy change, and it is a founder decision. It is written up in
 * docs/auth/SIGNUP-FAILURE-CONTRACT.md as the standing option.
 *
 * Until then the residual exposure is bounded and the rest of auth stays shut:
 * sign-in answers every credential failure with one sentence
 * (`invalid_credentials`), password reset and magic link answer generically
 * (`RECOVERY_GENERIC_RESPONSE`), and this endpoint is capped at five attempts
 * per IP per ten minutes, which is not a rate that enumerates a user base.
 *
 * NEVER RETURNS `unknown`. Every branch lands on a class whose sentence names a
 * cause or names us. That is the property the regression tests pin.
 */
const SIGNUP_CODE_MAP: Record<string, AuthFailureClass> = {
  // The address already has a CONFIRMED account. Verified against the live TEST
  // project: an UNCONFIRMED account does not reach here at all, because GoTrue
  // re-mints a fresh signup link for it rather than erroring. So this class only
  // ever describes an account that can genuinely be signed in to, which is what
  // makes "sign in, or reset your password" always sound advice.
  email_exists: 'email_exists',
  user_already_exists: 'email_exists',

  weak_password: 'weak_password',

  email_address_invalid: 'invalid_email',

  // Our mail path, not the user's details.
  over_email_send_rate_limit: 'mail_transport_failed',
  email_address_not_authorized: 'mail_transport_failed',
  email_provider_disabled: 'mail_transport_failed',

  over_request_rate_limit: 'rate_limited',

  // Registration switched off at the project. Ours, and the copy says so.
  signup_disabled: 'service_unavailable',
}

export function classifySignupError(input: {
  code?: string | null
  status?: number | null
  message?: string | null
}): Exclude<AuthFailureClass, 'unknown'> {
  const code = input.code?.trim().toLowerCase()
  const mapped = code ? SIGNUP_CODE_MAP[code] : undefined
  if (mapped) return mapped as Exclude<AuthFailureClass, 'unknown'>

  const status = typeof input.status === 'number' ? input.status : null

  if (status === 429) return 'rate_limited'

  // Anything that is not a 4xx is not GoTrue declining these details. No status
  // at all, or the 0 that supabase-js carries on AuthRetryableFetchError, means
  // no HTTP answer came back: a DNS failure, a dropped socket, a paused project.
  // A 5xx is equally ours. All of it is our outage, not the person's typing.
  if (status === null || status < 400 || status >= 500) return 'service_unavailable'

  // An unrecognised 4xx. GoTrue declined and did not tell us why in a form we
  // model. Assert no cause, but offer every route out. This is the branch that
  // used to be the generic sentence.
  return 'signup_rejected'
}

/**
 * The rate-limit sentence, carrying the real wait when the limiter told us one.
 *
 * "Please wait a few minutes" is guesswork the response already knows the answer
 * to: the 429 carries Retry-After. Rounded up to the minute, because a person
 * reading "wait 437 seconds" has to do arithmetic to act on it.
 */
export function rateLimitedMessage(retryAfterSeconds?: number | null): string {
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return authMessage('rate_limited')
  }
  if (retryAfterSeconds < 60) {
    return 'Too many attempts from this connection. Please wait about a minute and try again.'
  }
  const minutes = Math.ceil(retryAfterSeconds / 60)
  const unit = minutes === 1 ? 'minute' : 'minutes'
  return `Too many attempts from this connection. Please wait about ${minutes} ${unit} and try again.`
}

/**
 * Which field on the signup form a failure belongs under.
 *
 * Field-level placement is the pattern the competitor evidence supports:
 * TryBooking, the one comparator that still runs a name/email/password signup
 * form, puts "This password is too easy to guess. Please choose another."
 * directly beneath the password input rather than in a banner. A message about
 * the password sitting in a page-level alert makes the person hunt for which
 * input it means.
 *
 * `null` means the failure is not about one input (our outage, a rate limit),
 * so it belongs in the form-level alert.
 */
export function signupFieldFor(failure: AuthFailureClass): 'fullName' | 'email' | 'password' | null {
  switch (failure) {
    case 'missing_name':
    case 'name_too_long':
      return 'fullName'
    case 'email_exists':
    case 'invalid_email':
      return 'email'
    case 'weak_password':
    case 'password_too_long':
      return 'password'
    default:
      return null
  }
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
