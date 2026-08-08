'use client'

import { useEffect, useState } from 'react'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage, authMessage, readAuthErrorFromUrl } from '@/lib/auth/auth-errors'

export function ResetPasswordForm() {
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  // No native submit before the handler exists. See use-hydrated.ts.
  const hydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  // Set once the link is known to be dead, so the page stops claiming it is
  // still validating and shows a way forward instead.
  const [linkFailed, setLinkFailed] = useState(false)
  // The account's address, read from the recovery session. Chromium's password
  // form parser cannot associate a new credential with an account unless the
  // change-password form carries a username field, and this form has no
  // visible one. See the hidden input below.
  const [accountEmail, setAccountEmail] = useState('')

  useEffect(() => {
    let active = true

    // FIRST, before waiting on any session: a dead link arrives as
    // `#error=access_denied&error_code=otp_expired`. The fragment never reaches
    // the server, and the old code only ever read getSession(), so an expired
    // link parked the user on "Validating your reset link" forever.
    const urlError = readAuthErrorFromUrl({
      search: window.location.search,
      hash: window.location.hash,
    })
    if (urlError) {
      setError(authMessage(urlError.failure))
      setLinkFailed(true)
      return
    }

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session) {
        setAccountEmail(data.session.user.email ?? '')
        setSessionReady(true)
        return
      }
      // No session, no URL error: the link was never valid, or it was opened
      // in a different browser from the one that requested it. Both dead-end
      // silently without this timeout.
      setTimeout(() => {
        if (!active) return
        setSessionReady((ready) => {
          if (!ready) {
            setError(authMessage('session_missing'))
            setLinkFailed(true)
          }
          return ready
        })
      }, 4000)
    }

    checkSession()

    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setAccountEmail(session?.user.email ?? '')
        setSessionReady(true)
        setLinkFailed(false)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(authMessage('weak_password'))
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    let succeeded = false
    try {
      // Race the update against a hard timeout. Without this, a NavigatorLock
      // contention between concurrent auth-token reads can leave the call
      // pending forever, and the global unhandledrejection handler in
      // src/lib/supabase/client.ts swallows the surfaced error - the button
      // would otherwise stay stuck on "Updating password" with no feedback.
      const update = supabase.auth.updateUser({ password })
      const timeout = new Promise<{ error: { message: string } }>((_, reject) =>
        setTimeout(() => reject(new Error('Password update timed out. Please try again.')), 15000),
      )
      const result = (await Promise.race([update, timeout])) as Awaited<typeof update>

      if (result.error) {
        setError(
          authErrorMessage({
            errorCode: (result.error as { code?: string }).code,
            message: result.error.message,
          }),
        )
        return
      }

      succeeded = true

      // Best-effort sign-out so the user lands on /login fresh and re-authenticates
      // with the new password. Bounded so a hung lock cannot strand the UI; if it
      // fails, the redirect still fires and middleware bounces the authenticated
      // user to /dashboard, which is an acceptable fallback.
      const signOut = supabase.auth.signOut()
      const signOutTimeout = new Promise<void>((resolve) => setTimeout(resolve, 3000))
      await Promise.race([signOut, signOutTimeout]).catch(() => {})
    } catch (err) {
      // The 15-second timeout below throws a message written by us, so it is
      // safe to show. Anything else is classified rather than rendered raw.
      const raw = err instanceof Error ? err.message : ''
      setError(
        raw.startsWith('Password update timed out')
          ? raw
          : authErrorMessage({ message: raw }),
      )
    } finally {
      setLoading(false)
    }

    if (succeeded) {
      // Hard navigation: avoids the SPA router being intercepted by the
      // recovery-session cookie state and guarantees the auth cookies are
      // re-read fresh on /login.
      window.location.assign('/login?reset=success')
    }
  }

  // A dead link now says so, in a rendered EventLinqs page with a plain
  // sentence and the way forward. It used to sit on "Validating your reset
  // link" indefinitely, which is the blank-page class of failure.
  if (linkFailed) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error ?? authMessage('link_expired')}
        </div>
        <a
          href="/forgot-password"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0"
        >
          Request a new reset link
        </a>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="space-y-4 text-center text-sm text-ink-600">
        <p>Validating your reset link</p>
        <p className="text-xs text-ink-400">
          If nothing happens, request a new link from the{' '}
          <a href="/forgot-password" className="font-medium text-ink-900 underline hover:text-gold-600">
            reset page
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Chromium: on a change-password form with no visible username field,
          "Chrome will autofill a username somewhere, but not always in the
          actual username field". The documented fix is a hidden input carrying
          the account address with autocomplete="username", which is what lets
          the credential manager update the RIGHT saved credential instead of
          creating an orphan. type="hidden" renders nothing, so this changes no
          pixel. */}
      <input
        type="hidden"
        id="username"
        name="username"
        autoComplete="username"
        value={accountEmail}
        readOnly
      />

      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink-900">
          New password
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
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink-900">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm-new-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          placeholder="Re-enter your new password"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !hydrated}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Updating password' : 'Update password'}
      </button>
    </form>
  )
}
