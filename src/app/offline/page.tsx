import type { Metadata } from 'next'
import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'

/**
 * THE PAGE A BUYER GETS INSTEAD OF THE BROWSER'S ERROR PAGE.
 *
 * Close-out C8B.5, Scope v5 10.3: "a PWA that functions offline". Driven on
 * 15 September 2026 before this existed: cutting the network and navigating
 * anywhere produced `net::ERR_INTERNET_DISCONNECTED` and Chrome's own dinosaur,
 * with nothing on screen belonging to this platform.
 *
 * `public/app-sw.js` precaches this document at install and serves it whenever a
 * navigation cannot reach the network. It is a real route rather than a string
 * built inside the worker (which is what `public/scan-sw.js` does for the door)
 * because this one is a PUBLIC, buyer-facing surface: it wears the design
 * system, it is reachable and reviewable at /offline, and it cannot drift away
 * from the brand inside a string literal nobody opens.
 *
 * NEVER INDEXED. It is registered as `never` in src/lib/seo/indexing-policy.ts,
 * so the policy guard and the sitemap agree with this metadata rather than
 * having to be told twice.
 */
export const metadata: Metadata = {
  title: 'You are offline | EventLinqs',
  description: 'EventLinqs could not reach the network.',
  ...noIndexMetadata(),
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="EventLinqs home"
            className="font-display text-lg font-extrabold tracking-tight text-ink-900 hover:text-gold-700"
          >
            EVENTLINQS<span aria-hidden className="text-gold-500">.</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-xl text-center">
          <span
            aria-hidden
            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-600"
          >
            <WifiOff className="h-7 w-7" />
          </span>
          <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.22em] text-gold-700">
            No connection
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            You are offline
          </h1>
          {/*
            What it says is limited to what is true with no network. It does not
            offer to open a page it cannot fetch, and it does not promise the
            buyer their tickets are here: nothing of theirs is cached, and
            saying otherwise at a venue gate would be the worst possible moment
            to be wrong.
          */}
          <p className="type-measure mx-auto mt-4 text-base text-ink-600 sm:text-lg">
            EventLinqs could not reach the network, so this page could not load.
            Nothing you have already paid for is affected. Your tickets and their
            QR codes are in your confirmation email, which your mail app can show
            you without a signal.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/*
              A plain link to the same address, which is a real reload once the
              signal returns, and needs no script to work. The worker serves this
              document again if it still cannot reach the network, so pressing it
              is never a dead end.
            */}
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink-900 px-6 text-sm font-semibold text-white transition hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
            >
              Try again
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
