import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { sendSignupConfirmation } from '@/lib/email/auth-emails'

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
})

function safeOrigin(request: NextRequest): string {
  // Prefer a configured public site URL so the confirmation link cannot be
  // smuggled to an attacker-controlled host via a forged Host/Origin header
  // when the client posts to /api/auth/signup directly. Fall back to the
  // request origin only for local dev where NEXT_PUBLIC_SITE_URL is unset.
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const origin = request.headers.get('origin')
  if (origin) return origin
  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export async function POST(request: NextRequest) {
  const limited = await applyRateLimit('auth-signup', request)
  if (limited) return limited

  let body: z.infer<typeof BodySchema>
  try {
    const raw = await request.json()
    body = BodySchema.parse(raw)
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Please check your details and try again.' },
      { status: 400 },
    )
  }

  const origin = safeOrigin(request)
  const redirectTo =
    body.role === 'organiser'
      ? `${origin}/auth/callback?role=organiser`
      : `${origin}/auth/callback`

  const admin = createAdminClient()

  // generateLink with type 'signup' creates the user (email_confirmed=false)
  // and returns the action_link. We send that link via Resend rather than
  // letting Supabase send via its configured SMTP. If the email is already
  // registered, Supabase returns an error which we surface as a friendly
  // "account exists" message - no email enumeration concern beyond what
  // Supabase Auth's own UX already exposes via the public sign-up endpoint.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: body.email,
    password: body.password,
    options: {
      data: { full_name: body.fullName, intended_role: body.role },
      redirectTo,
    },
  })

  if (error) {
    const message = error.message ?? 'Could not create account.'
    const lower = message.toLowerCase()
    if (
      lower.includes('already registered') ||
      lower.includes('already exists') ||
      lower.includes('user already')
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'An account with that email already exists. Sign in or use forgot password.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }

  const actionLink = data?.properties?.action_link
  if (!actionLink) {
    // The user was created but we got no action link - delete-and-fail is the
    // safe move; otherwise the account is stranded with no way to verify.
    if (data?.user?.id) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
    }
    return NextResponse.json(
      { ok: false, error: 'Could not generate confirmation link. Please try again.' },
      { status: 500 },
    )
  }

  try {
    await sendSignupConfirmation({ to: body.email, confirmationUrl: actionLink })
  } catch (sendErr) {
    // Email send failed. We must not leave a half-created account that can
    // never receive a re-send via the same path. Roll back the user so the
    // form retry creates a fresh account end-to-end.
    if (data?.user?.id) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {})
    }
    const message = sendErr instanceof Error ? sendErr.message : 'Could not send confirmation email.'
    return NextResponse.json(
      { ok: false, error: 'Could not send confirmation email. Please try again.', detail: message },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
