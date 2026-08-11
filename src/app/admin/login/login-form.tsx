'use client'

import { useState, useTransition } from 'react'
import { useHydrated } from '@/lib/hooks/use-hydrated'
import { useRouter } from 'next/navigation'
import { loginAdminAction } from '../actions'

/*
 * MERGE NOTE, main into fix/security-hardening.
 *
 * This file carried its OWN `useHydrated`, written here only because the shared
 * hook did not exist yet. Its comment said so and named the exit condition:
 * "The two should be unified into the shared hook once both branches have
 * landed." The shared hook is now in main at src/lib/hooks/use-hydrated.ts and
 * its implementation is the same useSyncExternalStore snapshot pair, so the
 * local copy is retired in favour of the import above. That is the original
 * instruction being carried out rather than a side being picked, and it is a
 * no-op at runtime.
 *
 * What did NOT come from main: `method="post"` on the form below, and the two
 * comments explaining the gate. Main's version of this file has neither. They
 * are this branch's reason for existing and they survive the merge unchanged.
 */

interface LoginFormProps {
  next?: string
  initialError?: string
}

/**
 * Client form for /admin/login.
 *
 * Lays the form out vertically and supports a "use recovery code" toggle
 * that swaps the 6-digit TOTP input for a recovery-code input.
 */
export function LoginForm({ next, initialError }: LoginFormProps) {
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [useRecovery, setUseRecovery] = useState(false)
  // No native submit before the handler exists. See use-hydrated.ts.
  const hydrated = useHydrated()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (next) fd.set('next', next)
    setError(null)
    startTransition(async () => {
      const result = await loginAdminAction(fd)
      if (!result.ok) {
        setError(result.error ?? 'Sign in failed.')
        return
      }
      router.push(result.redirectTo ?? '/admin')
      router.refresh()
    })
  }

  return (
    /* method="post" AND a hydration-gated submit, deliberately both.
     *
     * This form previously had neither, and it carries the founder admin
     * password, the TOTP code and the break-glass recovery code. With no
     * `action` and no `method`, a submit before React attaches is a native GET
     * to the current URL, which is how /login?password=... reached production.
     *
     * method="post" means that even if the gate below is ever removed or
     * defeated, the fields travel in the request body and never enter the URL,
     * the browser history, or the Referer header. The disabled submit control
     * means the native submit cannot fire at all, and because disabling the
     * submit button also disables implicit submission, pressing Enter in the
     * password field is covered too.
     */
    <form
      method="post"
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6"
    >
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
        />
      </div>

      {!useRecovery ? (
        <div>
          <label htmlFor="totp" className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">
            6-digit code
          </label>
          <input
            id="totp"
            name="totp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm tracking-[0.4em] text-white outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
          <p className="mt-2 text-[11px] text-white/40">
            Skip on first sign in. You will be asked to enrol next.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="recovery" className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">
            Recovery code
          </label>
          <input
            id="recovery"
            name="recovery"
            type="text"
            autoComplete="off"
            placeholder="abcd-efg-hij"
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setUseRecovery(v => !v)}
        className="text-[11px] uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
      >
        {useRecovery ? 'Use 6-digit code' : 'Use recovery code'}
      </button>

      {error ? (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Disabled until hydrated, so there is no window in which a submit is a
          native GET carrying the password. This also disables implicit
          submission, so Enter in the password field cannot fire it either. */}
      <button
        type="submit"
        disabled={pending || !hydrated}
        className="w-full rounded-md bg-[var(--brand-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
