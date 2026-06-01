'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { submitEmailSignup } from '@/app/actions/email-subscribe'
import { trackEvent } from '@/lib/analytics/plausible'

/**
 * EmailSignupPanel (Batch 9.2) - editorial newsletter signup near the
 * footer. Brand-voice copy, inline form, dual-path subscribe + organiser
 * link.
 *
 * Server action is a stub (`submitEmailSignup`) per the 9.2 audit; the
 * email_subscribers table migration ships in 9.2.1. The form still
 * validates input and fires the appropriate Plausible events so the
 * conversion is captured immediately.
 *
 * Accessibility:
 *   - <label> linked to input, error message via aria-describedby
 *   - Success state announced via aria-live="polite"
 *   - prefers-reduced-motion honoured (no transitions on success swap)
 */
export function EmailSignupPanel() {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await submitEmailSignup(formData)
      if (result.ok) {
        setStatus('success')
        trackEvent('email_signup_submit_success')
      } else {
        setStatus('error')
        setError(result.error ?? 'Something went wrong. Please try again.')
        trackEvent('email_signup_submit_error', { reason: result.error ?? 'unknown' })
      }
    })
  }

  return (
    <section
      aria-labelledby="email-signup-heading"
      className="bg-[var(--color-navy-950)] text-white"
    >
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
          Stay in the know
        </p>
        <h2
          id="email-signup-heading"
          className="type-h2 mt-3 font-display tracking-tight"
        >
          Get the best events for your scene, every Friday.
        </h2>
        <p className="mt-4 text-base text-white/80 sm:text-lg">
          Hand-picked events across 14 communities and 20 cities. No spam, ever.
        </p>

        {status === 'success' ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-white/10 px-6 py-3 text-base font-semibold text-white"
          >
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--color-navy-950)]">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
            You are in. First email Friday.
          </div>
        ) : (
          <form action={handleSubmit} className="mx-auto mt-10 max-w-xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="email-signup-input" className="sr-only">
                Email address
              </label>
              <input
                id="email-signup-input"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-describedby={error ? 'email-signup-error' : 'email-signup-consent-note'}
                aria-invalid={status === 'error' ? 'true' : 'false'}
                disabled={pending}
                className="h-14 flex-1 rounded-full bg-white px-6 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-navy-950)] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="h-14 shrink-0 rounded-full bg-[var(--brand-accent)] px-8 text-base font-semibold text-[var(--color-navy-950)] transition-colors hover:bg-[var(--brand-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] disabled:opacity-60"
              >
                {pending ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>
            <label className="mt-4 flex items-start gap-3 text-left text-sm text-white/80">
              <input
                type="checkbox"
                name="consent"
                defaultChecked
                disabled={pending}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-white/30 bg-transparent accent-[var(--brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]"
              />
              <span>
                I agree to receive community event updates from EventLinqs.
              </span>
            </label>
            <p
              id="email-signup-consent-note"
              className="mt-2 text-left text-xs text-white/55 sm:pl-7"
            >
              We will only email you what we say we will. Read our{' '}
              <Link
                href="/legal/privacy"
                prefetch={false}
                className="font-semibold text-white/85 underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        )}

        {error ? (
          <p
            id="email-signup-error"
            role="alert"
            className="mt-3 text-sm text-[var(--brand-accent)]"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-8 text-sm text-white/60">
          Are you an organiser?{' '}
          <Link
            href="/organisers"
            prefetch={false}
            className="plausible-event-name=email_panel_organiser_click font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            Start hosting events ›
          </Link>
        </p>
      </div>
    </section>
  )
}
