'use client'

import { useState, type FormEvent } from 'react'

interface Props {
  cityName: string
}

/**
 * CityNewsletterCapture - email capture for the city CTA panel.
 *
 * Submits to /api/newsletter/subscribe (M9 marketing surface; for now
 * a fire-and-forget POST that logs and returns 200 even when the
 * downstream provider is not yet configured, so the UI doesn't block
 * the founder-pride positioning of the city page).
 *
 * Renders inline confirmation when the request succeeds; falls back to
 * an inline error when the network or API returns a 4xx/5xx. Never
 * throws to the boundary - the marketing surface must keep working.
 */
export function CityNewsletterCapture({ cityName }: Props) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'ok' | 'error'>('idle')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email || state === 'submitting') return
    setState('submitting')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'city', city: cityName }),
      })
      if (res.ok) setState('ok')
      else setState('error')
    } catch {
      setState('error')
    }
  }

  return (
    <div>
      <p className="font-display text-base font-semibold text-white">
        Get {cityName}&apos;s best events weekly
      </p>
      <p className="mt-1 text-sm text-white/75">
        One email a week, the events worth your time.
      </p>
      {state === 'ok' ? (
        <p className="mt-4 rounded-md border border-white/20 bg-white/5 px-4 py-3 text-sm text-white/90">
          Subscribed. We&apos;ll be in your inbox by next Friday.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="city-newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="city-newsletter-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 flex-1 rounded-full border border-white/30 bg-white/10 px-4 text-sm text-white placeholder:text-white/60 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40"
          />
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="h-11 rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)] disabled:opacity-60"
          >
            {state === 'submitting' ? 'Subscribing...' : 'Subscribe'}
          </button>
        </form>
      )}
      {state === 'error' ? (
        <p className="mt-2 text-xs text-white/70">
          Something went wrong. Try again or email us at hello@eventlinqs.com.
        </p>
      ) : null}
    </div>
  )
}
