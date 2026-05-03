'use client'

import { useEffect, useState } from 'react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export function ResetPasswordForm() {
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session) {
        setSessionReady(true)
        return
      }
    }

    checkSession()

    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true)
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
      setError('Password must be at least 8 characters.')
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
        setError(result.error.message)
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
      const message = err instanceof Error ? err.message : 'Could not update password. Please try again.'
      setError(message)
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
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Updating password' : 'Update password'}
      </button>
    </form>
  )
}
