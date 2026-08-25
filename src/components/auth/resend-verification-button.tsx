'use client'

import { useEffect, useState } from 'react'
import { authMessage, RESEND_VERIFICATION_GENERIC_RESPONSE } from '@/lib/auth/auth-errors'
import { reportClientError } from '@/lib/observability/client-error-report'

const COOLDOWN_SECONDS = 60
const STORAGE_KEY = 'el_verify_resend_ts'

type Props = { email: string }

export function ResendVerificationButton({ email }: Props) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const lastSent = parseInt(raw, 10)
    if (Number.isNaN(lastSent)) return 0
    return Math.max(0, Math.ceil((lastSent + COOLDOWN_SECONDS * 1000 - Date.now()) / 1000))
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [remaining])

  const handleResend = async () => {
    if (!email || remaining > 0 || status === 'sending') return

    setStatus('sending')
    setErrorMsg(null)

    // Posts to our own endpoint instead of `supabase.auth.resend()`. That call
    // went through Supabase Auth's built-in mailer and its 2-per-hour
    // project-wide cap, so the button meant to rescue a missing confirmation
    // email was itself the flow most likely to be throttled. The May 2026
    // closure report named this as a follow-up and it was never done.
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }

      if (!res.ok || !payload.ok) {
        setStatus('error')
        setErrorMsg(payload.message ?? authMessage('unknown'))
        return
      }

      sessionStorage.setItem(STORAGE_KEY, Date.now().toString())
      setRemaining(COOLDOWN_SECONDS)
      setStatus('sent')
    } catch (error) {
      reportClientError(error, { where: 'components/auth/resend-verification-button:64' })
      setStatus('error')
      setErrorMsg(authMessage('network'))
    }
  }

  const disabled = !email || remaining > 0 || status === 'sending'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={disabled}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' && 'Resending'}
        {status !== 'sending' && remaining > 0 && `Resend email in ${remaining}s`}
        {status !== 'sending' && remaining === 0 && 'Resend verification email'}
      </button>
      {status === 'sent' && remaining > 0 && (
        <p className="text-center text-xs text-success">
          {RESEND_VERIFICATION_GENERIC_RESPONSE}
        </p>
      )}
      {status === 'error' && errorMsg && (
        <p className="text-center text-xs text-error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
