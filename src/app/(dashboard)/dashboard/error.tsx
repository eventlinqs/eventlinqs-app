'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { captureException } from '@/lib/observability/sentry'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Organiser dashboard error boundary. Keeps a failed dashboard panel from
 * landing organisers on the generic global error page; offers the retry and
 * the safe paths an organiser actually needs mid-task.
 */
export default function DashboardErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    captureException(error, {
      tags: { boundary: 'dashboard-error' },
      digest: error.digest,
    })
  }, [error])

  return (
    // The (dashboard) layout already renders the page <main>; this boundary
    // fills it, so a section keeps the landmark tree valid.
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-xl text-center">
        <span
          aria-hidden
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"
        >
          <AlertTriangle className="h-7 w-7" />
        </span>
        <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.22em] text-ink-600">
          Something went wrong
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
          We hit a snag loading your dashboard
        </h1>
        <p className="mt-4 text-base text-ink-600 sm:text-lg">
          Our team has been notified. Your events and sales are unaffected: try
          again, or head to your events list.
        </p>
        {error.digest ? (
          <p className="mt-2 text-sm text-ink-400">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-ink-900 px-6 text-sm font-semibold text-white transition hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
          >
            Retry
          </button>
          <Link
            href="/dashboard/events"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-ink-200 bg-white px-6 text-sm font-semibold text-ink-900 transition hover:border-gold-500 hover:text-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
          >
            My events
          </Link>
        </div>
      </div>
    </section>
  )
}
