import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { sendSignupConfirmation } from '@/lib/email/auth-emails'
import {
  decodeRefCode,
  isReferralSource,
  toAttributionRecord,
  type CapturedAttribution,
} from '@/lib/growth/referrals'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import { KIT_DRAFT_COOKIE, isKitDraftToken } from '@/lib/growth/kit-draft'
import { trackEmailCapturedAfterRenderServer } from '@/lib/analytics/plausible'
import {
  authMessage,
  classifySignupError,
  rateLimitedMessage,
  signupFieldFor,
  type AuthFailureClass,
} from '@/lib/auth/auth-errors'
import { safeAuthOrigin } from '@/lib/auth/safe-origin'

export const dynamic = 'force-dynamic'

// The signup endpoint replaces the previous client-side `supabase.auth.signUp`
// path, which depended on Supabase Auth's outbound SMTP for the confirmation
// email. The default Supabase SMTP enforces a 4-emails-per-hour project-wide
// rate limit that produced silent confirmation-email loss in production once
// signups exceeded a trickle. Driving the email through the Resend SDK on our
// own pipeline removes that ceiling and gives us deliverability observability
// (delivered/bounced/complained webhooks) we did not have before.

const BodySchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(['attendee', 'organiser']).default('attendee'),
  // First-touch attribution forwarded from the share / invite-organiser link.
  // All optional: a purely organic signup sends none of these.
  ref: z.string().max(24).optional(),
  refSource: z.string().max(40).optional(),
  refEvent: z.string().max(160).optional(),
  // Optional, unticked-by-default digest opt-in (Broadcast Layer SPEC 3.1).
  // Never a signup condition: the account is created whether or not it is set.
  digestOptIn: z.boolean().optional(),
})

/**
 * THE FAILURE CONTRACT. Every non-200 this endpoint returns has this shape, and
 * the form renders from it rather than inventing copy of its own.
 *
 *   failure            the class, so the form can choose its recovery links
 *   error              the sentence, straight from the copy deck
 *   field              which input to attach it to, or null for the form alert
 *   retryAfterSeconds  present only on a rate limit
 *
 * `error` keeps its name because the form and scripts/verify/auth-journey-e2e.mjs
 * already read that key. `failure` is the addition: before it, the form could
 * only ever print a string, which is why a 429 from the shared rate limiter put
 * the literal token "rate_limited" in front of the user (the limiter answers
 * `{ error: 'rate_limited', message: '...' }`, and the form printed `error`).
 */
type SignupFailureBody = {
  ok: false
  failure: AuthFailureClass
  error: string
  field: 'fullName' | 'email' | 'password' | null
  retryAfterSeconds?: number
}

function fail(
  failure: AuthFailureClass,
  status: number,
  extra?: { message?: string; retryAfterSeconds?: number; headers?: HeadersInit },
): NextResponse<SignupFailureBody> {
  const body: SignupFailureBody = {
    ok: false,
    failure,
    error: extra?.message ?? authMessage(failure),
    field: signupFieldFor(failure),
  }
  if (typeof extra?.retryAfterSeconds === 'number') {
    body.retryAfterSeconds = extra.retryAfterSeconds
  }
  return NextResponse.json(body, { status, headers: extra?.headers })
}

/** Build the attribution record to persist, or null for an organic signup. */
function capturedFromBody(body: z.infer<typeof BodySchema>): CapturedAttribution | null {
  const referredBy = decodeRefCode(body.ref ?? null)
  const source = isReferralSource(body.refSource) ? body.refSource : 'organic'
  if (!referredBy && source === 'organic') return null
  return {
    referredBy,
    refCode: body.ref ?? null,
    source,
    event: body.refEvent ?? null,
  }
}

// The open-redirect guard that used to live here is now shared with the three
// other endpoints that mint emailed links: src/lib/auth/safe-origin.ts.

export async function POST(request: NextRequest) {
  // The shared limiter answers in its own machine-token shape, which this
  // endpoint must not pass through to a person. Re-emit it in the contract
  // above, carrying the real wait from Retry-After instead of "a few minutes".
  const limited = await applyRateLimit('auth-signup', request)
  if (limited) {
    const retryAfter = Number(limited.headers.get('Retry-After'))
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    return fail('rate_limited', 429, {
      message: rateLimitedMessage(seconds),
      retryAfterSeconds: seconds,
      headers: limited.headers,
    })
  }

  // Field-level validation. "Please check your details and try again" told a
  // person that one of four inputs was wrong without saying which; each branch
  // now names its own input so the form can mark it.
  let body: z.infer<typeof BodySchema>
  try {
    const raw = await request.json()
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      // Both ends of each bound get their own sentence. Collapsing them onto the
      // floor's message told someone who pasted a long passphrase to "choose a
      // longer one", which is worse than saying nothing.
      const issueFor = (field: string) =>
        parsed.error.issues.find((issue) => issue.path[0] === field)
      const email = issueFor('email')
      if (email) return fail('invalid_email', 400)
      const password = issueFor('password')
      if (password) return fail(password.code === 'too_big' ? 'password_too_long' : 'weak_password', 400)
      const name = issueFor('fullName')
      if (name) return fail(name.code === 'too_big' ? 'name_too_long' : 'missing_name', 400)
      return fail('signup_rejected', 400)
    }
    body = parsed.data
  } catch {
    // The body was not JSON at all. Not a field problem, and not something a
    // person typing into the form can cause.
    return fail('signup_rejected', 400)
  }

  const origin = safeAuthOrigin(request)
  const redirectTo =
    body.role === 'organiser'
      ? `${origin}/auth/callback?role=organiser`
      : `${origin}/auth/callback`

  // createClient throws when the service-role key is missing or blank. Uncaught,
  // that became a Next 500 whose HTML body the form could not parse, so it fell
  // back to the generic sentence: a deployment misconfiguration reading to the
  // user as an unexplained failure. It is ours, and it now says so.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (configErr) {
    console.error('[auth/signup] admin client unavailable', {
      reason: configErr instanceof Error ? configErr.message : String(configErr),
      at: new Date().toISOString(),
    })
    return fail('service_unavailable', 503)
  }

  // generateLink with type 'signup' creates the user (email_confirmed=false)
  // and returns the action_link. We send that link via Resend rather than
  // letting Supabase send via its configured SMTP.
  //
  // An address that already has an UNCONFIRMED account does not fail here:
  // GoTrue re-mints a fresh link for the same user, which is what lets someone
  // who never received the first email simply sign up again. Only a CONFIRMED
  // account produces email_exists. Verified against the live TEST project.
  let data: Awaited<ReturnType<typeof admin.auth.admin.generateLink>>['data'] | null = null
  let error: { code?: string; status?: number; message?: string } | null = null
  try {
    const result = await admin.auth.admin.generateLink({
      type: 'signup',
      email: body.email,
      password: body.password,
      options: {
        data: { full_name: body.fullName, intended_role: body.role },
        redirectTo,
      },
    })
    data = result.data
    error = result.error
  } catch (thrown) {
    // supabase-js normally returns transport failures as `error`, but a throw
    // here would otherwise become a Next 500 with an HTML body, which the form
    // cannot parse and which therefore rendered as the generic sentence.
    error = { message: thrown instanceof Error ? thrown.message : String(thrown) }
  }

  if (error) {
    // KEYED ON code AND status, NEVER ON error.message. The substring test that
    // stood here classified GoTrue's "A user with this email address has already
    // been registered" as unrecognised, so the already-registered branch below
    // was unreachable and every existing-account signup got the generic
    // sentence. See classifySignupError for the full account.
    const failure = classifySignupError({
      code: error.code,
      status: error.status,
      message: error.message,
    })
    // Enough detail to diagnose stays server-side; the provider's own string
    // never reaches the browser.
    console.error('[auth/signup] generateLink failed', {
      failure,
      code: error.code ?? null,
      status: error.status ?? null,
      reason: error.message ?? 'no message',
      at: new Date().toISOString(),
    })
    const status =
      failure === 'email_exists'
        ? 409
        : failure === 'rate_limited'
          ? 429
          : failure === 'service_unavailable'
            ? 503
            : failure === 'mail_transport_failed'
              ? 502
              : 400
    return fail(failure, status)
  }

  // Email a link to OUR /auth/confirm route built from the hashed token, never
  // the raw GoTrue action_link. The action_link runs the implicit flow and
  // redirects with the session in the URL FRAGMENT (#access_token=...), which a
  // server route can never read: /auth/callback saw no ?code= and every
  // email-confirm click dead-ended on /login?error=auth_callback_failed with
  // the organiser role never applied. /auth/confirm verifies the token_hash
  // server-side (verifyOtp), sets the session cookies, applies the organiser
  // role, and lands the user signed in on /dashboard.
  const hashedToken = data?.properties?.hashed_token
  if (!hashedToken) {
    // The user was created but we got no verification token - delete-and-fail
    // is the safe move; otherwise the account is stranded with no way to verify.
    if (data?.user?.id) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
    }
    console.error('[auth/signup] generateLink returned no hashed_token', {
      at: new Date().toISOString(),
    })
    // Ours, and nothing about the details typed. Same sentence as any other
    // failure of our account service, because to the person it is the same
    // thing: try again shortly, nothing to change.
    return fail('service_unavailable', 503)
  }

  const confirmationUrl =
    `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=signup` +
    (body.role === 'organiser' ? '&role=organiser' : '') +
    `&next=${encodeURIComponent('/dashboard')}`

  try {
    await sendSignupConfirmation({ to: body.email, confirmationUrl })
  } catch (sendErr) {
    // Email send failed. We must not leave a half-created account that can
    // never receive a re-send via the same path. Roll back the user so the
    // form retry creates a fresh account end-to-end.
    if (data?.user?.id) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
    }
    const message = sendErr instanceof Error ? sendErr.message : 'Could not send confirmation email.'
    // Cause logged server-side with enough detail to diagnose (brief 1.5); the
    // response carries only the copy-deck sentence. `detail` used to echo the
    // transport's own error back to the browser.
    console.error('[auth/signup] transport failure', {
      email: body.email,
      reason: message,
      at: new Date().toISOString(),
    })
    return fail('mail_transport_failed', 502)
  }

  // Persist first-touch attribution onto the new profile (best-effort). The
  // profile row already exists (the handle_new_user trigger fires on the admin
  // generateLink create), so we merge the attribution into its metadata. A
  // failure here must never fail an otherwise successful signup.
  const captured = capturedFromBody(body)
  const newUserId = data?.user?.id
  if (captured && newUserId) {
    try {
      const { data: existing } = await admin
        .from('profiles')
        .select('metadata')
        .eq('id', newUserId)
        .single()
      const prior = (existing?.metadata ?? {}) as Record<string, unknown>
      await admin
        .from('profiles')
        .update({
          metadata: {
            ...prior,
            attribution: toAttributionRecord(captured, new Date().toISOString()),
          },
        })
        .eq('id', newUserId)
    } catch {
      // swallow - attribution is non-critical telemetry
    }
  }

  // Record the express digest opt-in (best-effort, never fails the signup).
  // City scope comes from the el_city cookie when it names a real city.
  if (body.digestOptIn && newUserId) {
    try {
      const cookieCity = request.cookies.get('el_city')?.value ?? null
      let citySlug: string | null = null
      if (cookieCity) {
        const { data: city } = await admin
          .from('cities')
          .select('slug')
          .eq('slug', cookieCity)
          .maybeSingle()
        citySlug = city?.slug ?? null
      }
      await recordPlatformDigestConsent(admin, {
        email: body.email,
        userId: newUserId,
        citySlug,
        source: 'registration',
        at: new Date().toISOString(),
      })
    } catch {
      // swallow - consent capture must never fail the signup
    }
  }

  // Activation metric: an email captured while a rendered kit draft is
  // waiting (the /launch composer's signed draft cookie) is the
  // product-qualified capture, counted separately from ordinary signups.
  // Fire-and-forget; never blocks or fails the signup.
  const kitDraft = request.cookies.get(KIT_DRAFT_COOKIE)?.value
  if (isKitDraftToken(kitDraft)) {
    void trackEmailCapturedAfterRenderServer(`${origin}/launch`, {
      source: 'launch_composer',
    })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
