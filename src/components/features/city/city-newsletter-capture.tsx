'use client'

import { useState, type FormEvent } from 'react'
import { reportClientError } from '@/lib/observability/client-error-report'
import { contactAddress } from '@/lib/email/sender'

interface Props {
  cityName: string
  /**
   * Surface tone. `light` (the navy-on-canvas default for in-scope buyer
   * surfaces) renders navy text on a light field; `dark` preserves the
   * white-on-navy treatment for any host panel still on a dark surface.
   */
  tone?: 'light' | 'dark'
}

/**
 * CityNewsletterCapture: email capture for the city CTA panel.
 *
 * Submits to /api/newsletter/subscribe. ONE STEP (law 50 (a), Lawal, 21 November
 * 2026, 10:06: "If somebody clicks on 'Subscribe to a newsletter,' that is the
 * record"): the click subscribes, and this week's picks are sent at once; no
 * confirm email, ever. A hidden honeypot field stops scripts without a step
 * for a person (law 50 (d)).
 *
 * Says "subscribed" only when the server recorded it, and "on their way" only
 * when the welcome was sent; falls back to an inline error when the network or
 * API returns a 4xx/5xx. Never throws to the boundary: the marketing surface
 * must keep working.
 */
export function CityNewsletterCapture({ cityName, tone = 'dark' }: Props) {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'ok' | 'error'>('idle')
  const [welcome, setWelcome] = useState<string | null>(null)
  const dark = tone === 'dark'
  const c = {
    heading: dark ? 'text-white' : 'text-ink-900',
    sub: dark ? 'text-white/75' : 'text-ink-600',
    ok: dark ? 'border-white/20 bg-white/5 text-white/90' : 'border-ink-200 bg-[var(--surface-1)] text-ink-700',
    input: dark
      ? 'border-white/30 bg-white/10 text-white placeholder:text-white/60'
      : 'border-ink-300 bg-white text-ink-900 placeholder:text-ink-400',
    err: dark ? 'text-white/70' : 'text-ink-500',
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email || state === 'submitting') return
    setState('submitting')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'city', city: cityName, website }),
      })
      if (res.ok) {
        const answer = (await res.json().catch(() => null)) as { welcome?: string } | null
        setWelcome(answer?.welcome ?? null)
        setState('ok')
      } else setState('error')
    } catch (error) {
      reportClientError(error, { where: 'components/features/city/city-newsletter-capture:55' })
      setState('error')
    }
  }

  return (
    <div>
      <p className={`font-display text-base font-semibold ${c.heading}`}>
        Get {cityName}&apos;s best events weekly
      </p>
      <p className={`mt-1 text-sm ${c.sub}`}>
        One email a week, the events worth your time.
      </p>
      {state === 'ok' ? (
        <p className={`mt-4 rounded-md border px-4 py-3 text-sm ${c.ok}`}>
          {welcome === 'already'
            ? `You're already on the ${cityName} guide.`
            : welcome === 'sent'
              ? "You're subscribed. This week's picks are on their way to your inbox."
              : "You're subscribed. Your weekly guide arrives each Wednesday."}
        </p>
      ) : (
        <form method="post" onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="city-newsletter-email" className="sr-only">
            Email address
          </label>
          {/* The honeypot (law 50 (d)): off screen, out of the tab order and hidden from assistive technology, so
              only a script fills it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="city-newsletter-website">Website</label>
            <input id="city-newsletter-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          <input
            id="city-newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`h-11 rounded-full border px-4 text-sm sm:flex-1 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40 ${c.input}`}
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
        <p className={`mt-2 text-xs ${c.err}`}>
          Something went wrong. Try again or email us at {contactAddress('hello')}.
        </p>
      ) : null}
    </div>
  )
}
