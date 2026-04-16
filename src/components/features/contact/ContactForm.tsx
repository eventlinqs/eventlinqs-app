'use client'

/**
 * ContactForm — client component.
 *
 * Receives `initialSubject` pre-computed by the server from ?topic= and ?interest= params.
 * On submit: shows inline success state and console.logs.
 * TODO(M11): wire to POST /api/contact → Resend delivery.
 */

import { useState } from 'react'
import Link from 'next/link'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

function TwitterIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.52V6.75a4.85 4.85 0 01-1.02-.06z" />
    </svg>
  )
}

interface ContactFormProps {
  initialSubject?: string
}

export function ContactForm({ initialSubject = '' }: ContactFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(initialSubject)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    // TODO(M11): replace with POST /api/contact → Resend delivery
    console.log('[Contact form submission]', { name, email, subject, message })
    setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
    }, 500)
  }

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">

      {/* LEFT — Contact form */}
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Send us a message
        </h2>

        {submitted ? (
          <div className="mt-8 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Message received — thanks!
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              We&apos;ll reply within 24 hours.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false)
                setName('')
                setEmail('')
                setSubject(initialSubject)
                setMessage('')
              }}
              className="mt-6 text-sm font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)]"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <FormField
              id="contact-name"
              label="Full name"
              type="text"
              required
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
            />
            <FormField
              id="contact-email"
              label="Email address"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
            {/* Subject: plain text input — pre-filled from ?topic= and ?interest= URL params */}
            <FormField
              id="contact-subject"
              label="Subject"
              type="text"
              required
              placeholder="What's your question about?"
              value={subject}
              onChange={(e) => setSubject((e.target as HTMLInputElement).value)}
            />
            {/* Message: multiline textarea — support added to FormField in Command 2a */}
            <FormField
              id="contact-message"
              label="Message"
              multiline
              rows={5}
              required
              placeholder="Tell us what you need..."
              value={message}
              onChange={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? 'Sending…' : 'Send message'}
            </Button>
          </form>
        )}
      </div>

      {/* RIGHT — Contact details */}
      <div className="lg:pt-12">
        <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Other ways to reach us
        </h2>

        <dl className="mt-8 space-y-6 text-sm">
          <div>
            <dt className="font-semibold text-[var(--text-primary)]">Email</dt>
            <dd className="mt-1">
              <a
                href="mailto:hello@eventlinqs.com"
                className="text-[var(--text-secondary)] underline underline-offset-2 decoration-transparent hover:text-[var(--brand-accent)] hover:decoration-[var(--brand-accent)] transition-colors"
              >
                hello@eventlinqs.com
              </a>
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-[var(--text-primary)]">Location</dt>
            <dd className="mt-1 text-[var(--text-secondary)]">Melbourne, Australia</dd>
          </div>

          <div>
            <dt className="font-semibold text-[var(--text-primary)]">Response time</dt>
            <dd className="mt-1 text-[var(--text-secondary)]">Within 24 hours, Mon–Fri</dd>
          </div>

          <div>
            <dt className="font-semibold text-[var(--text-primary)]">Follow us</dt>
            <dd className="mt-3 flex items-center gap-4">
              <a
                href="https://twitter.com/eventlinqs"
                aria-label="EventLinqs on X (Twitter)"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <TwitterIcon />
              </a>
              <a
                href="https://instagram.com/eventlinqs"
                aria-label="EventLinqs on Instagram"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <InstagramIcon />
              </a>
              <a
                href="https://tiktok.com/@eventlinqs"
                aria-label="EventLinqs on TikTok"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <TikTokIcon />
              </a>
            </dd>
          </div>
        </dl>

        {/* Help Centre link */}
        <div className="mt-10 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-5">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Looking for a quick answer?
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Browse our Help Centre — you might find what you need without waiting.
          </p>
          <Link
            href="/help"
            className="mt-3 inline-flex text-sm font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)] transition-colors"
          >
            Go to Help Centre &rsaquo;
          </Link>
        </div>
      </div>

    </div>
  )
}
