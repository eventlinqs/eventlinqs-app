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
 * Global error boundary.
 *
 * Renders a chromeless minimal error UI rather than reusing PageShell. The
 * SiteHeader (mounted by PageShell) calls server-only Supabase auth and
 * `next/headers`, which Next 16's Turbopack build refuses to compile from
 * a client-tagged file like this one. A standalone layout keeps the
 * boundary functional without dragging server-only deps through the
 * client tree.
 */
export default function ErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    captureException(error, {
      tags: { boundary: 'app-router-error' },
      digest: error.digest,
    })
  }, [error])

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="EventLinqs home"
            className="font-display text-lg font-extrabold tracking-tight text-ink-900 hover:text-gold-600"
          >
            EVENTLINQS<span aria-hidden className="text-gold-500">.</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
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
            We hit a snag loading this page
          </h1>
          <p className="mt-4 text-base text-ink-600 sm:text-lg">
            Our team has been notified. You can try again, or head back to safe ground.
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
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-ink-200 bg-white px-6 text-sm font-semibold text-ink-900 transition hover:border-gold-500 hover:text-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
            >
              Back home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
