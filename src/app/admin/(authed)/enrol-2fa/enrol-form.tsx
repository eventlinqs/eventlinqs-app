'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmTotpEnrolmentAction } from '../../actions'

interface EnrolFormProps {
  enrolToken: string
}

/**
 * Verify the user typed a working code, then receive the recovery codes.
 * The codes are shown once - users must save them out of band before
 * leaving the page.
 */
export function EnrolForm({ enrolToken }: EnrolFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('enrolToken', enrolToken)
    setError(null)
    startTransition(async () => {
      const result = await confirmTotpEnrolmentAction(fd)
      if (!result.ok) {
        setError(result.error ?? 'Enrolment failed.')
        return
      }
      setRecoveryCodes(result.recoveryCodes ?? [])
    })
  }

  if (recoveryCodes) {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-6">
        <h2 className="font-display text-sm uppercase tracking-widest text-amber-200">3. Save your recovery codes</h2>
        <p className="mt-2 text-sm text-white/70">
          Each code works once if you lose your authenticator. Store them in your password manager
          now. They will not be shown again.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {recoveryCodes.map(c => (
            <li key={c} className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white">
              {c}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            router.push('/admin')
            router.refresh()
          }}
          className="mt-6 w-full rounded-md bg-[var(--brand-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:opacity-90"
        >
          I have saved them - continue
        </button>
      </section>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-sm uppercase tracking-widest text-white/60">2. Verify the first code</h2>
      <p className="mt-2 text-sm text-white/70">
        Type the 6-digit code your authenticator is currently showing.
      </p>
      <label htmlFor="code" className="mt-4 mb-1.5 block text-xs uppercase tracking-[0.18em] text-white/60">
        Code
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        required
        autoComplete="one-time-code"
        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm tracking-[0.4em] text-white outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
      />
      {error ? (
        <div role="alert" className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-md bg-[var(--brand-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Verifying...' : 'Verify and enrol'}
      </button>
    </form>
  )
}
