'use client'

import { useState } from 'react'
import { authMessage, RECOVERY_GENERIC_RESPONSE } from '@/lib/auth/auth-errors'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Posts to our own endpoint instead of calling
  // `supabase.auth.resetPasswordForEmail()` from the browser. That call drove
  // Supabase Auth's built-in mailer, capped at 2 emails per hour project-wide,
  // and surfaced its raw "Error sending recovery email" straight to the user.
  // /api/auth/recover mints the link with the admin API and sends it through
  // our own Resend transport, and answers with copy from the auth copy deck.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }

      if (!res.ok || !payload.ok) {
        // The endpoint already speaks in copy-deck sentences. The fallback
        // covers a proxy or platform error that never reached the handler.
        setError(payload.message ?? authMessage('unknown'))
        setLoading(false)
        return
      }

      setSent(true)
      setLoading(false)
    } catch {
      setError(authMessage('network'))
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
          <svg className="h-7 w-7 text-gold-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
          </svg>
        </div>
        {/* OWASP Authentication Cheat Sheet: the reset response must read the
            same whether or not the address is registered. The previous copy
            ("We sent a reset link to <address>") confirmed the account exists
            to anyone who typed one in. */}
        <p className="text-sm text-ink-900">{RECOVERY_GENERIC_RESPONSE}</p>
        <p className="text-xs text-ink-400">
          Did not receive it? Check spam, or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-ink-900 underline hover:text-gold-600"
          >
            try again
          </button>
          .
        </p>
      </div>
    )
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink-900">
          Email
        </label>
        {/* WHATWG autofill: `username` is the credential-group token, so the
            credential manager offers the saved account address here. `email`
            belongs to the contact-information group and Chromium's password
            form parser ignores it. A stable `name` is required for Chromium to
            associate the field at all. */}
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

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Sending link' : 'Send reset link'}
      </button>
    </form>
  )
}
