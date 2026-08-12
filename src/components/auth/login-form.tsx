'use client'

import { useState } from 'react'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { assertLoginRateLimit } from '@/app/actions/auth-rate-limit'
import { GoogleButton } from './google-button'
import { AuthDivider } from './auth-divider'
import { AuthErrorFromUrl } from './auth-error-from-url'
import {
  authErrorMessage,
  authMessage,
  MAGIC_LINK_GENERIC_RESPONSE,
  OAUTH_ACCOUNT_HINT,
} from '@/lib/auth/auth-errors'

type Props = {
  /**
   * Whether the Google provider is genuinely enabled on the Supabase project
   * this deployment resolves to. Resolved server-side in the page and passed
   * down, so the button either exists or does not: there is no window in which
   * a user can click one that leads to a raw JSON error page.
   */
  googleEnabled: boolean
}

export function LoginForm({ googleEnabled }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const resetFlag = searchParams.get('reset') === 'success'
  const callbackError = searchParams.get('error')

  // Carried across from the signup form when someone is told their address
  // already has an account. Sending them to a blank field to retype what they
  // just typed is where a recovery link stops being a route out.
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // No native submit before the handler exists. See use-hydrated.ts.
  const hydrated = useHydrated()
  const [error, setError] = useState<string | null>(
    callbackError === 'auth_callback_failed'
      ? 'We could not finish signing you in. Please try again, or sign in with your email address and password.'
      : callbackError === 'verification_failed'
        ? authMessage('link_expired')
        : null,
  )
  // A credential failure is the moment a Google-only account looks broken to
  // its owner: there is no password to get right. The hint is shown on EVERY
  // credential failure, never conditionally, so it cannot reveal whether the
  // address typed in belongs to an account (brief 1.4 and 3.4 together).
  const [showOAuthHint, setShowOAuthHint] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setShowOAuthHint(false)

    const gate = await assertLoginRateLimit()
    if (!gate.ok) {
      setError(authMessage('rate_limited'))
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Never render `error.message`. Supabase's raw strings vary by version,
      // leak implementation detail, and in the credential case would let the
      // wording differ between "no such user" and "wrong password", which is
      // exactly the discrepancy OWASP tells us to remove.
      const failure = authErrorMessage({
        errorCode: (error as { code?: string }).code,
        message: error.message,
        status: error.status,
      })
      setError(failure)
      setShowOAuthHint(true)
      setLoading(false)
      return
    }

    // Honour the ?redirect= deep-link set by middleware/guards when an
    // unauthenticated user was bounced. Only allow safe internal paths
    // (no protocol-relative // or absolute URLs) to prevent open redirect.
    const redirectParam = searchParams.get('redirect')
    const safeRedirect =
      redirectParam &&
      redirectParam.startsWith('/') &&
      !redirectParam.startsWith('//') &&
      !redirectParam.includes('://')
        ? redirectParam
        : '/dashboard'
    router.push(safeRedirect)
    router.refresh()
  }

  // Posts to our own endpoint instead of `supabase.auth.signInWithOtp()`. That
  // call sent through Supabase Auth's built-in mailer and its 2-per-hour
  // project-wide cap, the same ceiling that broke password reset.
  const handleMagicLink = async () => {
    if (!email) {
      setError('Enter your email address to receive a sign-in link.')
      return
    }
    setLoading(true)
    setError(null)
    setShowOAuthHint(false)

    const gate = await assertLoginRateLimit()
    if (!gate.ok) {
      setError(authMessage('rate_limited'))
      setLoading(false)
      return
    }

    const redirectParam = searchParams.get('redirect')

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, next: redirectParam ?? undefined }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }

      if (!res.ok || !payload.ok) {
        setError(payload.message ?? authMessage('unknown'))
        setLoading(false)
        return
      }

      setMagicSent(true)
      setLoading(false)
    } catch {
      setError(authMessage('network'))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {resetFlag && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Password updated. Sign in with your new password.
        </div>
      )}

      {/* Catches provider errors that arrive in the URL FRAGMENT. GoTrue
          answers an expired or refused link with `#error=...&error_code=...`,
          which never reaches the server, so a route handler cannot see it. */}
      <AuthErrorFromUrl />

      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error-strong" role="alert">
          {error}
          {showOAuthHint && googleEnabled && (
            <span className="mt-1 block">{OAUTH_ACCOUNT_HINT}</span>
          )}
        </div>
      )}

      {magicSent && (
        <div className="rounded-lg border border-ink-200 bg-ink-100 px-4 py-3 text-sm text-ink-900">
          {MAGIC_LINK_GENERIC_RESPONSE}
        </div>
      )}

      {/* The button renders ONLY when the provider is genuinely enabled on the
          Supabase project this deployment resolves to. Rendering it
          unconditionally is what sent the founder to a raw JSON error page on
          2026-08-02: signInWithOAuth resolves with error null and then hands
          the tab to Supabase, so no client-side check can rescue it. */}
      {googleEnabled && (
        <>
          <GoogleButton label="Continue with Google" />
          <AuthDivider label="or" />
        </>
      )}

      <form method="post" onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            Email
          </label>
          {/* WHATWG autofill defines current-password as "the current password
              for the account identified by THE USERNAME FIELD". Without a
              `username` token there is no such field, so Chromium's password
              parser had nothing to pair the password with and offered no saved
              credential. `name` must be present and stable for the same reason. */}
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-ink-900">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-ink-600 transition-colors hover:text-gold-600"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !hydrated}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleMagicLink}
        disabled={loading || !hydrated}
        className="block w-full text-center text-sm font-medium text-ink-600 transition-colors hover:text-gold-600"
      >
        Send me a magic link instead
      </button>
    </div>
  )
}
