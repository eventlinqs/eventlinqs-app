import { createAdminClient } from '@/lib/supabase/admin'
import { sendMagicLink, sendPasswordReset, sendSignupConfirmation } from '@/lib/email/auth-emails'

/**
 * ONE server-side path for every auth link EventLinqs emails.
 *
 * The pattern is the one `/api/auth/signup` proved in May 2026:
 *
 *   admin.auth.admin.generateLink(...)   -> mints the token, sends NOTHING
 *   sendEmail(...)                       -> our Resend transport does the send
 *
 * `generateLink` is the important half. It returns `properties.hashed_token`
 * without invoking Supabase's mailer at all, which is how we escape the
 * 2-per-hour built-in cap that produced "Error sending recovery email".
 *
 * We email a link to OUR `/auth/confirm` route built from the hashed token,
 * never the raw GoTrue `action_link`. The action_link runs the implicit flow
 * and returns the session in the URL FRAGMENT, which a server route can never
 * read. `/auth/confirm` verifies the token_hash server-side via `verifyOtp`,
 * sets the session cookies, and lands the user on a rendered page.
 *
 * ENUMERATION CONTRACT. Every function here returns a discriminated result and
 * NEVER throws for "no such account". The caller maps `no_account` and `sent`
 * onto the identical user-facing response, per OWASP: "If that email address is
 * in our database, we will send you an email to reset your password." Only a
 * genuine transport failure is distinguishable, and only because the brief
 * requires the user to be told when our mail is down (see 1.5).
 */

export type DispatchResult =
  /** A link was minted and the transport accepted the message. */
  | { outcome: 'sent'; messageId: string }
  /** No account in a state that can receive this link. Nothing was sent. */
  | { outcome: 'no_account'; reason: string }
  /** A link was minted but our transport rejected or failed. */
  | { outcome: 'send_failed'; reason: string }

/**
 * The GoTrue token types we mint.
 *
 * `signup` is deliberately absent. `generateLink({ type: 'signup' })` requires
 * the user's PASSWORD, which is available exactly once - inside
 * `/api/auth/signup`, where the user just typed it - and never again. A
 * verification resend therefore mints a `magiclink` token instead: verifying
 * one confirms an unconfirmed email address AND signs the user in, which is
 * precisely the outcome a "resend verification email" button promises. The
 * email the user receives still reads as a confirmation, because that is what
 * it does for them; only the token type underneath differs.
 */
type LinkKind = 'recovery' | 'magiclink'

/**
 * Decide whether a `generateLink` failure is account-shaped (answer
 * generically, reveal nothing) or infrastructure-shaped (tell the user
 * honestly that our side is broken).
 *
 * KEYED ON THE STRUCTURED ERROR, NEVER THE PROSE. An earlier version of this
 * matched substrings of `error.message`, and the live journey walk on
 * 2026-08-03 caught it failing open: GoTrue answers a missing account with
 *
 *   { name: 'AuthApiError', status: 404, code: 'user_not_found',
 *     message: 'User with this email not found' }
 *
 * and the list was checking for "user not found", which is not a substring of
 * "User with this email not found". An unregistered address therefore got a
 * 502 while a registered one got a 200, which is precisely the enumeration
 * oracle this module exists to prevent. Prose is not an API.
 *
 * The rule now runs the safe way round: a 4xx from GoTrue means it declined to
 * mint a link for this address, which is always account-shaped, whatever the
 * wording. Only a 5xx or a transport-level throw is treated as our outage.
 * Every unrecognised 4xx therefore lands on the enumeration-safe side by
 * default rather than needing to be listed first.
 */
function isAbsentAccount(error: { status?: number; code?: string; message?: string }): boolean {
  if (typeof error.status === 'number') {
    return error.status >= 400 && error.status < 500
  }
  // No status at all means we never got an HTTP answer, so this is our problem.
  return false
}

/**
 * Mint a token and build the confirm URL we control.
 *
 * The `type` carried on `/auth/confirm` must be the OTP type `verifyOtp`
 * expects, so it is always the same value we minted with.
 */
async function mintConfirmUrl(input: {
  kind: LinkKind
  email: string
  origin: string
  next: string
}): Promise<{ ok: true; url: string } | { ok: false; absent: boolean; reason: string }> {
  const admin = createAdminClient()

  const { data, error } =
    input.kind === 'recovery'
      ? await admin.auth.admin.generateLink({
          type: 'recovery',
          email: input.email,
          options: { redirectTo: `${input.origin}${input.next}` },
        })
      : await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: input.email,
          options: { redirectTo: `${input.origin}${input.next}` },
        })

  if (error) {
    const shaped = error as { status?: number; code?: string; message?: string }
    const message = `${shaped.code ?? 'no_code'} (${shaped.status ?? 'no_status'}): ${
      shaped.message ?? 'generateLink failed'
    }`
    return { ok: false, absent: isAbsentAccount(shaped), reason: message }
  }

  const hashedToken = data?.properties?.hashed_token
  if (!hashedToken) {
    return { ok: false, absent: false, reason: 'generateLink returned no hashed_token' }
  }

  const url =
    `${input.origin}/auth/confirm` +
    `?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=${input.kind}` +
    `&next=${encodeURIComponent(input.next)}`

  return { ok: true, url }
}

/** Password reset. Lands the user on `/auth/reset-password` with a live session. */
export async function dispatchPasswordReset(input: {
  email: string
  origin: string
}): Promise<DispatchResult> {
  const minted = await mintConfirmUrl({
    kind: 'recovery',
    email: input.email,
    origin: input.origin,
    next: '/auth/reset-password',
  })
  if (!minted.ok) {
    return minted.absent
      ? { outcome: 'no_account', reason: minted.reason }
      : { outcome: 'send_failed', reason: minted.reason }
  }

  try {
    const { id } = await sendPasswordReset({ to: input.email, resetUrl: minted.url })
    return { outcome: 'sent', messageId: id }
  } catch (err) {
    return { outcome: 'send_failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Passwordless sign-in. Lands the user on the dashboard, signed in. */
export async function dispatchMagicLink(input: {
  email: string
  origin: string
  next?: string
}): Promise<DispatchResult> {
  const minted = await mintConfirmUrl({
    kind: 'magiclink',
    email: input.email,
    origin: input.origin,
    next: input.next ?? '/dashboard',
  })
  if (!minted.ok) {
    return minted.absent
      ? { outcome: 'no_account', reason: minted.reason }
      : { outcome: 'send_failed', reason: minted.reason }
  }

  try {
    const { id } = await sendMagicLink({ to: input.email, signInUrl: minted.url })
    return { outcome: 'sent', messageId: id }
  } catch (err) {
    return { outcome: 'send_failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Re-send a signup confirmation.
 *
 * Mints a `magiclink` token (see LinkKind above for why not `signup`).
 * Verifying it confirms the address and signs the user in. GoTrue answers
 * "User not found" for an address with no account, and `isAbsentAccount` folds
 * that into `no_account`, so the button cannot be used to test whether an
 * address is registered.
 */
export async function dispatchVerificationResend(input: {
  email: string
  origin: string
  next?: string
}): Promise<DispatchResult> {
  const minted = await mintConfirmUrl({
    kind: 'magiclink',
    email: input.email,
    origin: input.origin,
    next: input.next ?? '/dashboard',
  })
  if (!minted.ok) {
    return minted.absent
      ? { outcome: 'no_account', reason: minted.reason }
      : { outcome: 'send_failed', reason: minted.reason }
  }

  try {
    const { id } = await sendSignupConfirmation({
      to: input.email,
      confirmationUrl: minted.url,
    })
    return { outcome: 'sent', messageId: id }
  } catch (err) {
    return { outcome: 'send_failed', reason: err instanceof Error ? err.message : String(err) }
  }
}
