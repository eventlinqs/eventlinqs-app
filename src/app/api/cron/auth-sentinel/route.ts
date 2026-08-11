import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { sendEmail } from '@/lib/email/send'
import { getEmailFrom, getSenderDomain } from '@/lib/email/sender'
import { alertDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'
import { RENDERABLE_PROVIDERS } from '@/lib/auth/providers'

export const runtime = 'nodejs'

/**
 * THE AUTH SENTINEL.
 *
 * Every defect that prompted this work was a CONFIGURATION state, not a code
 * bug. Google disabled on the project while the button rendered. Supabase Auth
 * on its built-in 2-per-hour mailer. A Site URL pointing at the wrong domain.
 * The codebase compiled, every gate was green, a sweep of 314 pages and 148
 * screenshots found nothing, because not one of those checks ever asked the
 * live system a question. This route asks, every ten minutes, in production.
 *
 * The build guards (scripts/guards/) own the code side: no ungated provider
 * button, no Supabase-mailer dependency, no sender literal, no missing
 * autocomplete token. This owns the configuration side. Neither is sufficient
 * alone, which is exactly why the 2026-08-02 defects survived a green CI.
 *
 * SIX CHECKS
 *   A. PROVIDER PARITY  every provider the app can render is genuinely enabled
 *                       at the auth endpoint.
 *   B. REDIRECT + SITE URL  every redirect URL the code builds is allowlisted,
 *                       and the Site URL is the canonical host.
 *   C. MAIL TRANSPORT   our Resend transport actually accepts a message.
 *   D. SENDER DOMAIN    the sending domain is verified in Resend.
 *   E. CONTENT TYPE     no auth route answers a browser with anything but HTML.
 *   F. SUPABASE SMTP    custom SMTP rather than the built-in fallback.
 *
 * SAFETY (brief 4.3). It creates no accounts, mails no real person, and writes
 * nothing to any database:
 *   - Check A reads GoTrue's public settings document. Read-only.
 *   - Check B uses `/auth/v1/verify` with a DELIBERATELY INVALID token. GoTrue
 *     validates `redirect_to` before it validates the token, so the redirect it
 *     answers with reveals the allowlist decision. An invalid token consumes
 *     nothing, sends nothing, and mutates nothing. Verified against production
 *     on 2026-08-02.
 *   - Check C sends to `delivered@resend.dev`, Resend's official delivery
 *     simulator. It is not a mailbox and reaches no person.
 *   - Checks D, E, F are reads.
 * No probe touches `orders`, `profiles`, `auth.users`, or any other table.
 */

const PENDING_ALERT_SUBJECT = 'Auth sentinel ALERT'

/**
 * Resend's official delivery simulator. Documented at
 * resend.com/docs/dashboard/emails/send-test-emails: "Use the provided
 * resend.dev test email addresses to simulate different email events without
 * damaging your domain reputation." Not a mailbox, reaches no person.
 */
const TRANSPORT_SINK = 'delivered@resend.dev'

/**
 * The alert recipient, resolved through the ONE destination definition in
 * src/lib/env/destinations.ts (founder ruling R2). Same resolution as the
 * payment sentinel and the health runner, so this cannot alert into a void and
 * cannot drift away from where every other platform fault already reports.
 *
 * This function used to read `AUTH_ALERT_EMAIL`, then `PAYMENT_ALERT_EMAIL`,
 * then fall back to the founder's personal address as a literal. It was written
 * before ruling R2 landed on main. R2 had just removed the only two copies of
 * that literal in shipped source, so this would have been a third, reintroducing
 * the exact defect the ruling exists to prevent. Two things changed:
 *
 *   the personal literal  gone. The fallback is now PLATFORM_INBOX,
 *                         hello@eventlinqs.com, which was proven deliverable on
 *                         2026-08-03 by reading back Resend's delivery event.
 *                         The fallback itself is deliberate and stays: a
 *                         deleted variable must degrade to a real inbox, never
 *                         to nothing.
 *   AUTH_ALERT_EMAIL      gone. It was never declared in
 *                         src/lib/env/manifest.mjs, never set in any store, and
 *                         never documented, so it was an undeclared variable
 *                         standing between an alert and its recipient. If auth
 *                         alerts should one day split from payment alerts, that
 *                         is a manifest entry plus a destinations.ts function,
 *                         not a private env read here.
 *
 * Never alerts@eventlinqs.com: it HARD BOUNCES (550 5.4.1, Exchange Online, no
 * such mailbox). See docs/ENV-DOCTRINE.md section 4.
 */
const ALERT_TO = () => alertDestination()

/**
 * The redirect URLs the code actually builds, read from the code rather than
 * assumed. Kept beside the call sites they mirror:
 *   /auth/callback        google-button.tsx, api/auth/signup/route.ts
 *   /auth/reset-password  dispatch-auth-link.ts (recovery)
 *   /auth/confirm         dispatch-auth-link.ts (all emailed links)
 */
const REQUIRED_REDIRECT_PATHS = ['/auth/callback', '/auth/reset-password', '/auth/confirm']

/** Auth routes a browser can navigate to. Each must answer with HTML. */
const BROWSER_AUTH_ROUTES = [
  '/login',
  '/signup',
  '/signup?role=organiser',
  '/forgot-password',
  '/verify-email-sent?email=sentinel%40example.com',
  '/auth/reset-password',
  '/auth/callback',
  '/auth/confirm',
]

/**
 * Three states, not two. `unverified` is for a check whose evidence is not
 * reachable from this deployment: it is reported in the payload and never
 * silently counted as a pass, but it does not alert, because a check that
 * always fires is a check the founder learns to ignore.
 */
type Status = 'ok' | 'fail' | 'unverified'

type CheckResult = {
  name: string
  status: Status
  detail: string
  probableCause?: string
  fix?: string
}

const TIMEOUT = 15000

// ---------------------------------------------------------------------------
// A. PROVIDER PARITY
// ---------------------------------------------------------------------------
async function checkProviderParity(): Promise<CheckResult> {
  const name = 'provider parity (rendered vs enabled)'
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) {
    return { name, status: 'fail', detail: 'Supabase URL or anon key missing on this deployment', probableCause: 'missing Supabase env' }
  }
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT),
      cache: 'no-store',
    })
    if (!res.ok) {
      return { name, status: 'fail', detail: `settings endpoint returned ${res.status}`, probableCause: 'Supabase Auth unreachable' }
    }
    const body = (await res.json()) as { external?: Record<string, boolean> }
    const external = body.external ?? {}

    // The app hides a button whose provider is off, so a disabled provider is
    // not a broken page. It IS a silently degraded sign-in that nobody chose,
    // and the founder wants to know the button vanished from production.
    const disabled = RENDERABLE_PROVIDERS.filter((p) => external[p] !== true)
    if (disabled.length > 0) {
      return {
        name,
        status: 'fail',
        detail: `provider(s) the app can render are DISABLED on this project: ${disabled.join(', ')}. The button is correctly hidden, so no user sees a JSON error, but that sign-in method is silently unavailable.`,
        probableCause: 'provider switched off in Supabase Dashboard > Authentication > Providers',
        fix: 'Enable it in the Supabase Dashboard, or remove it from RENDERABLE_PROVIDERS if the removal was deliberate.',
      }
    }
    return { name, status: 'ok', detail: `all renderable providers enabled: ${RENDERABLE_PROVIDERS.join(', ')}` }
  } catch (err) {
    return { name, status: 'fail', detail: String(err).slice(0, 160), probableCause: 'Supabase Auth unreachable from the sentinel' }
  }
}

// ---------------------------------------------------------------------------
// B. REDIRECT ALLOWLIST AND SITE URL
//
// GoTrue validates `redirect_to` against the allowlist BEFORE it validates the
// token. An allowlisted target is echoed back in the 303 Location; a rejected
// one falls back to the project's Site URL. So one invalid-token request per
// URL reads the allowlist, and one deliberately-bogus target reads the Site URL.
// ---------------------------------------------------------------------------
async function probeRedirect(supabaseUrl: string, target: string): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/verify?token=sentinel-invalid-probe&type=recovery&redirect_to=${encodeURIComponent(target)}`,
    { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) },
  )
  return res.headers.get('location')
}

async function checkRedirectConfig(origin: string): Promise<CheckResult> {
  const name = 'redirect allowlist and Site URL'
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    return { name, status: 'fail', detail: 'Supabase URL missing', probableCause: 'missing Supabase env' }
  }

  try {
    const problems: string[] = []

    for (const path of REQUIRED_REDIRECT_PATHS) {
      const target = `${origin}${path}`
      const location = await probeRedirect(supabaseUrl, target)
      if (!location || !location.startsWith(target)) {
        problems.push(`${target} is NOT allowlisted (GoTrue redirected to ${location ?? 'nothing'})`)
      }
    }

    // A target that can never be allowlisted, so the answer is the Site URL.
    const siteUrlProbe = await probeRedirect(supabaseUrl, 'https://sentinel-not-allowlisted.invalid/probe')
    const siteUrl = siteUrlProbe ? new URL(siteUrlProbe).origin : null
    const expected = new URL(origin).origin
    if (siteUrl && siteUrl !== expected) {
      problems.push(
        `Supabase Site URL is ${siteUrl} but this deployment serves ${expected}. Any auth link without an explicit redirect lands on the wrong host.`,
      )
    }

    if (problems.length > 0) {
      return {
        name,
        status: 'fail',
        detail: problems.join(' | '),
        probableCause: 'Supabase Dashboard > Authentication > URL Configuration is out of step with the code',
        fix: `Set Site URL to ${expected} and add ${REQUIRED_REDIRECT_PATHS.map((p) => expected + p).join(', ')} to Redirect URLs.`,
      }
    }
    return { name, status: 'ok', detail: `Site URL is ${expected}; all ${REQUIRED_REDIRECT_PATHS.length} redirect URLs allowlisted` }
  } catch (err) {
    return { name, status: 'fail', detail: String(err).slice(0, 160), probableCause: 'Supabase Auth unreachable from the sentinel' }
  }
}

// ---------------------------------------------------------------------------
// C. MAIL TRANSPORT
// ---------------------------------------------------------------------------
async function checkMailTransport(): Promise<CheckResult> {
  const name = 'auth mail transport'
  if (!process.env.RESEND_API_KEY) {
    return {
      name,
      status: 'fail',
      detail: 'RESEND_API_KEY is not set on this deployment, so no auth email can be sent at all',
      probableCause: 'missing Resend env',
      fix: 'Set RESEND_API_KEY in the Vercel environment for this deployment.',
    }
  }
  try {
    const { id } = await sendEmail({
      to: TRANSPORT_SINK,
      subject: 'EventLinqs auth sentinel transport probe',
      text: `Scheduled transport probe. Sender: ${getEmailFrom()}. No action needed.`,
      html: `<p>Scheduled transport probe. Sender: ${getEmailFrom()}. No action needed.</p>`,
    })
    return { name, status: 'ok', detail: `transport accepted a message from ${getEmailFrom()} (id ${id})` }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return {
      name,
      status: 'fail',
      detail: `transport REJECTED the probe: ${reason.slice(0, 200)}`,
      probableCause: 'Resend API key invalid, sending domain unverified, or quota exhausted',
      fix: `Check the Resend dashboard for ${getSenderDomain()} and the API key on this deployment.`,
    }
  }
}

// ---------------------------------------------------------------------------
// D. SENDER DOMAIN VERIFICATION
//
// BOUNDARY with the health sentinel's `email` check (src/lib/health/checks.ts).
// Both ask Resend whether the sending domain is verified, so they must never be
// able to disagree. They cannot: this reads getSenderDomain() and that reads
// senderDomainsInUse(), and since 2026-08-05 both resolve from the one module,
// src/lib/email/sender.ts. There is a single domain fact and two readers of it.
//
// They are kept separate because they answer to different audiences and fail
// differently. The health check is a platform-wide binary critical/ok. This one
// is auth-specific: it separates "not registered at Resend at all" from
// "registered but not verified", carries the auth remediation path, and has a
// third state, `unverified`, for when the evidence is not reachable from this
// deployment, so a missing answer is reported rather than counted as a pass.
//
// The cost of the overlap is that one unverified domain raises two alerts, five
// minutes apart, to the same inbox. That is duplicate NOTIFICATION, not
// duplicate logic, and it is the safe direction: the alternative is a sender
// fault that only one schedule would have caught.
// ---------------------------------------------------------------------------
async function checkSenderDomain(): Promise<CheckResult> {
  const name = 'sender domain verified in Resend'
  const key = process.env.RESEND_API_KEY
  const domain = getSenderDomain()
  if (!key) {
    return { name, status: 'fail', detail: 'RESEND_API_KEY not set', probableCause: 'missing Resend env' }
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) {
      return { name, status: 'unverified', detail: `Resend domains API returned ${res.status}; the API key may lack domain read scope` }
    }
    const body = (await res.json()) as { data?: { name: string; status: string }[] }
    const match = (body.data ?? []).find((d) => d.name.toLowerCase() === domain)
    if (!match) {
      return {
        name,
        status: 'fail',
        detail: `sending domain ${domain} is not registered in Resend at all (registered: ${(body.data ?? []).map((d) => d.name).join(', ') || 'none'})`,
        probableCause: 'sender domain never added to Resend, or EMAIL_FROM points at the wrong domain',
        fix: `Add and verify ${domain} in the Resend dashboard, or correct EMAIL_FROM.`,
      }
    }
    if (match.status !== 'verified') {
      return {
        name,
        status: 'fail',
        detail: `sending domain ${domain} is "${match.status}", not "verified". Resend will reject sends.`,
        probableCause: 'DNS records for the sending domain incomplete or removed',
        fix: `Re-check the SPF, DKIM and return-path DNS records for ${domain} in the Resend dashboard.`,
      }
    }
    return { name, status: 'ok', detail: `${domain} is verified in Resend` }
  } catch (err) {
    return { name, status: 'unverified', detail: `Resend domains API unreachable: ${String(err).slice(0, 120)}` }
  }
}

// ---------------------------------------------------------------------------
// E. CONTENT TYPE
// ---------------------------------------------------------------------------
async function checkContentTypes(origin: string): Promise<CheckResult> {
  const name = 'auth routes answer a browser with HTML'
  const bad: string[] = []
  try {
    for (const path of BROWSER_AUTH_ROUTES) {
      const res = await fetch(`${origin}${path}`, {
        headers: { accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
      })
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('text/html')) {
        bad.push(`${path} -> ${res.status} ${type || '(no content-type)'}`)
      }
    }
    if (bad.length > 0) {
      return {
        name,
        status: 'fail',
        detail: `auth route(s) answering a browser with non-HTML: ${bad.join(', ')}`,
        probableCause: 'a route handler is returning JSON or an empty body where a page is expected',
        fix: 'Every auth failure must land on a rendered EventLinqs page. See src/lib/auth/auth-errors.ts.',
      }
    }
    return { name, status: 'ok', detail: `all ${BROWSER_AUTH_ROUTES.length} auth routes resolve to text/html` }
  } catch (err) {
    return { name, status: 'fail', detail: String(err).slice(0, 160), probableCause: 'deployment unreachable from the sentinel' }
  }
}

// ---------------------------------------------------------------------------
// F. SUPABASE CUSTOM SMTP
//
// Not readable from the anon key: it needs a Supabase Management API personal
// access token, which is a CI-only secret and is deliberately not in the
// runtime environment. When absent this reports `unverified` rather than
// alerting into a void.
//
// The exposure is small BECAUSE of the work this sentinel accompanies: all four
// EventLinqs auth emails now go through our own Resend transport (check C
// proves it), so Supabase's mailer is only reached by flows we do not drive,
// such as an email-change confirmation.
// ---------------------------------------------------------------------------
async function checkSupabaseSmtp(): Promise<CheckResult> {
  const name = 'Supabase Auth custom SMTP'
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const url = getSupabaseUrl()
  const ref = url ? new URL(url).hostname.split('.')[0] : null

  if (!token || !ref) {
    return {
      name,
      status: 'unverified',
      detail:
        'SUPABASE_ACCESS_TOKEN is not available to this deployment, so custom-SMTP configuration cannot be read. All four EventLinqs auth emails run on our own Resend transport (see the mail transport check), so Supabase SMTP only affects flows we do not drive.',
      fix: 'To make this check assertive, expose a Supabase Management API token to the runtime environment.',
    }
  }

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) {
      return { name, status: 'unverified', detail: `Management API returned ${res.status}` }
    }
    const cfg = (await res.json()) as { smtp_host?: string | null; smtp_sender_name?: string | null }
    if (!cfg.smtp_host) {
      return {
        name,
        status: 'fail',
        detail: 'Supabase Auth is on the BUILT-IN mailer, capped at 2 emails per hour project-wide',
        probableCause: 'custom SMTP not configured in the Supabase Dashboard',
        fix: 'Supabase Dashboard > Authentication > Emails > SMTP Settings. See docs/hardening/auth/FOUNDER-STEPS.md.',
      }
    }
    return { name, status: 'ok', detail: `custom SMTP configured (${cfg.smtp_host})` }
  } catch (err) {
    return { name, status: 'unverified', detail: `Management API unreachable: ${String(err).slice(0, 120)}` }
  }
}

// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const origin = getSiteUrl()
  const deployment = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin

  /**
   * `?simulate=` runs the alert path on purpose so the drill can be proven,
   * exactly as the payment sentinel's `missign` drill does. Still cron-authed.
   * Documented in docs/hardening/auth/GUARD-PROOFS.md.
   */
  const simulate = request.nextUrl.searchParams.get('simulate')

  const checks: CheckResult[] =
    simulate === 'alert'
      ? [
          {
            name: 'deliberate alert drill',
            status: 'fail',
            detail: 'simulate=alert requested; this is a drill, not a real failure',
            probableCause: 'drill',
          },
        ]
      : [
          await checkProviderParity(),
          await checkRedirectConfig(origin),
          await checkMailTransport(),
          await checkSenderDomain(),
          await checkContentTypes(origin),
          await checkSupabaseSmtp(),
        ]

  const failures = checks.filter((c) => c.status === 'fail')
  const unverified = checks.filter((c) => c.status === 'unverified')

  let alerted = false
  if (failures.length > 0) {
    const lines = failures
      .map(
        (f) =>
          `- ${f.name}: ${f.detail}` +
          (f.probableCause ? `\n  Probable cause: ${f.probableCause}` : '') +
          (f.fix ? `\n  Fix: ${f.fix}` : ''),
      )
      .join('\n\n')
    const body =
      `The auth sentinel found a problem.\n\n` +
      `Deployment: ${deployment}\nSite: ${origin}\nTime: ${new Date().toISOString()}\n\n` +
      `${lines}\n\n` +
      (unverified.length > 0
        ? `Not verifiable from this deployment: ${unverified.map((u) => u.name).join(', ')}\n\n`
        : '') +
      `Runbook: docs/hardening/auth/FOUNDER-STEPS.md\n\nEventLinqs auth sentinel`
    try {
      await sendEmail({
        to: ALERT_TO(),
        subject: `${PENDING_ALERT_SUBJECT}: ${failures[0].probableCause ?? failures[0].name}`,
        text: body,
        html: `<p><strong>The auth sentinel found a problem.</strong></p><p>Deployment: ${deployment}<br/>Site: ${origin}<br/>Time: ${new Date().toISOString()}</p><pre>${lines}</pre><p>Runbook: docs/hardening/auth/FOUNDER-STEPS.md</p><p>EventLinqs auth sentinel</p>`,
      })
      alerted = true
    } catch (err) {
      console.error('[auth-sentinel] alert email failed:', err)
    }
  }

  return NextResponse.json(
    { ok: failures.length === 0, deployment, site: origin, checks, alerted },
    { status: failures.length === 0 ? 200 : 503 },
  )
}
