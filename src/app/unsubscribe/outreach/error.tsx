'use client'

import { useEffect } from 'react'
import Link from 'next/link'
// The Sentry-free seam, for the reason given in src/app/error.tsx: importing
// the SDK shim here would pull it into this route's client bundle.
import { reportClientError } from '@/lib/observability/client-error-report'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * WHAT THE PAGE SAYS WHEN THE UNSUBSCRIBE COULD NOT BE RECORDED.
 *
 * The server action throws when the write fails
 * (src/lib/outreach/unsubscribe.ts, recordOutreachUnsubscribe), and the throw
 * lands here. The only true sentence is that nothing was saved and pressing
 * again may work, so that is what it says. It never says "You're unsubscribed"
 * about a row that does not exist, because the person would then keep
 * receiving mail they asked to stop.
 *
 * Same shell and card as the page, so the person is visibly still on the
 * unsubscribe page and not dropped on a generic error screen.
 */
export default function OutreachUnsubscribeError({ error, reset }: Props) {
  useEffect(() => {
    reportClientError(error, {
      tags: { boundary: 'outreach-unsubscribe' },
      digest: error.digest,
    })
  }, [error])

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="text-lg font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-display text-2xl font-bold text-ink-900">We could not record your unsubscribe</h1>
          <p className="mt-3 text-sm text-ink-600">
            Something went wrong on our side and nothing was saved, so you are not unsubscribed yet.
            Please try again.
          </p>
          {error.digest ? (
            <p className="mt-2 text-xs text-ink-600">
              Reference: <span className="font-mono">{error.digest}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
          >
            Try again
          </button>
        </div>
      </main>
    </div>
  )
}
