'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleButton } from './google-button'
import { AuthDivider } from './auth-divider'
import { AuthErrorFromUrl } from './auth-error-from-url'
import { REF_COOKIE, REF_SOURCE_COOKIE, REF_EVENT_COOKIE } from '@/lib/growth/referrals'
import { DIGEST_CONSENT_WORDING } from '@/lib/consent/wording'
import { authMessage } from '@/lib/auth/auth-errors'

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

type Props = {
  role?: 'attendee' | 'organiser'
  /**
   * Whether Google is genuinely enabled on the Supabase project this
   * deployment resolves to. Resolved server-side in the page. See
   * src/lib/auth/providers.ts for why this cannot be a client-side check.
   */
  googleEnabled: boolean
}

export function SignupForm({ role = 'attendee', googleEnabled }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Unticked by default (Spam Act 2003): express opt-in only, never a
  // signup condition.
  const [digestOptIn, setDigestOptIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isOrganiser = role === 'organiser'

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 8) {
      setError(authMessage('weak_password'))
      setLoading(false)
      return
    }

    try {
      // Server-side signup at /api/auth/signup creates the user via the
      // admin API and dispatches the confirmation email through Resend.
      // We no longer call supabase.auth.signUp directly because that path
      // depends on Supabase's outbound SMTP, which had a 4-per-hour project
      // cap that silently dropped confirmation emails in production.
      // Forward the first-touch attribution captured from the share or
      // invite-an-organiser link so the new profile records who drove it.
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          ref: readCookie(REF_COOKIE),
          refSource: readCookie(REF_SOURCE_COOKIE),
          refEvent: readCookie(REF_EVENT_COOKIE),
          digestOptIn,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }

      if (!res.ok || !payload.ok) {
        // The endpoint speaks in copy-deck sentences; the fallback covers a
        // proxy or platform error that never reached the handler.
        setError(payload.error ?? authMessage('unknown'))
        setLoading(false)
        return
      }

      const nextParam = isOrganiser ? '&next=/dashboard' : ''
      router.push(`/verify-email-sent?email=${encodeURIComponent(email)}${nextParam}`)
    } catch {
      setError(authMessage('network'))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {isOrganiser && (
        <div className="rounded-lg border border-gold-400/40 bg-gold-100/60 px-4 py-3 text-sm text-ink-900">
          <p className="font-semibold">You are signing up as an organiser.</p>
          <p className="mt-0.5 text-xs text-ink-600">
            After your email is verified, you will be taken to your dashboard to create your first event.
          </p>
        </div>
      )}

      {/* Catches provider errors delivered in the URL fragment, which never
          reach the server. */}
      <AuthErrorFromUrl />

      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      {/* Gated for the same reason as the login form: an ungated button leads
          to a raw JSON page when the provider is disabled. */}
      {googleEnabled && (
        <>
          <GoogleButton label="Continue with Google" />
          <AuthDivider label="or" />
        </>
      )}

      <form method="post" onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-ink-900">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            Email
          </label>
          {/* `username`, not `email`: it is the credential-group token that
              pairs with new-password below, so the credential manager offers to
              SAVE the pair on submit. With autocomplete="email" Chromium saw a
              contact field and a lone password, and offered nothing. */}
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-900">
            Password
          </label>
          <input
            id="password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="At least 8 characters"
          />
          <p className="mt-1.5 text-xs text-ink-400">
            Use 8 or more characters with a mix of letters and numbers.
          </p>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
          <input
            // Both branches independently gave this checkbox an id and a name
            // (main as digest-opt-in, auth-hardening as digestOptIn) and the
            // rebase kept both, which React resolves by silently taking the
            // last. One pair, camelCase to match fullName above and the
            // digestOptIn state and request field.
            id="digestOptIn"
            name="digestOptIn"
            type="checkbox"
            checked={digestOptIn}
            onChange={(e) => setDigestOptIn(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-200 text-gold-500 focus:ring-2 focus:ring-gold-400"
          />
          <span className="text-xs text-ink-600">{DIGEST_CONSENT_WORDING}</span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? 'Creating account'
            : isOrganiser
              ? 'Create organiser account'
              : 'Create account'}
        </button>

        {/* Organisers take on the Organiser Agreement (fees, payouts, chargeback
            liability, prohibited events) in addition to the general terms, so it
            is surfaced at the point of consent, not only in the footer. */}
        <p className="text-center text-xs text-ink-400">
          By signing up you agree to our{' '}
          <a href="/legal/terms" className="underline hover:text-gold-600">Terms</a>
          {isOrganiser ? (
            <>
              {', '}
              <a href="/legal/organiser-terms" className="underline hover:text-gold-600">Organiser Agreement</a>
            </>
          ) : null}
          {' '}and{' '}
          <a href="/legal/privacy" className="underline hover:text-gold-600">Privacy Policy</a>.
        </p>
      </form>
    </div>
  )
}
