import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'
import { readGoLinks } from '@/lib/growth/go'
import { viaOf, type GoLink } from '@/lib/growth/go-math'
import { formatEventDateShort } from '@/lib/dates/event-time'

/**
 * /go, THE LINK IN BIO (the engine plan of 28 October 2026, part H; Lawal's final directive of that day). A post's
 * image only ever says "Link in bio"; this is the bio's link: each live post, newest first, in its approved words, each
 * a real link through /go/[piece], which counts the press and lands on the post's own page (src/lib/growth/go-math.ts).
 *
 * Fast and small on purpose: a phone arriving from Instagram reads one short list. Read live on every request, so a
 * post leaves the list the minute its last night ends. Never indexed (src/lib/seo/indexing-policy.ts): it is a doorway
 * for people who came from a post, not a page for search.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'From our posts | EventLinqs',
  description: 'Every night from our latest posts, one tap away.',
  ...noIndexMetadata(),
}

type Props = { searchParams: Promise<{ via?: string }> }

export default async function GoPage({ searchParams }: Props) {
  const via = viaOf((await searchParams).via)
  let links: GoLink[] = []
  let unread = false
  try {
    links = await readGoLinks()
  } catch (err) {
    unread = true
    console.warn('[go] the posts could not be read', err instanceof Error ? err.message : String(err))
  }

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

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
        <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-gold-700">From our posts</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900">
          Tap the post you saw
        </h1>

        {links.length > 0 ? (
          <ul className="mt-8 space-y-3">
            {links.map((l) => (
              <li key={l.pieceId}>
                <a
                  href={`/go/${l.pieceId}?via=${via}`}
                  className="group flex min-h-[64px] items-center justify-between gap-4 rounded-xl border border-ink-100 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-base font-bold leading-snug text-ink-900">{l.words}</span>
                    {l.nextNightStart ? (
                      <span className="mt-1 block text-sm text-ink-600">
                        Next: {formatEventDateShort(l.nextNightStart, l.nextNightZone)}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight aria-hidden className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:text-gold-700" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-base text-ink-700">
            {unread
              ? 'Our latest posts could not be loaded just now. Everything that is on is still one tap away below.'
              : 'Nothing from our latest posts is still ahead. Everything that is on is one tap away below.'}
          </p>
        )}

        <nav aria-label="More on EventLinqs" className="mt-10 border-t border-ink-100 pt-6">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <li>
              <Link
                href="/this-weekend"
                className="flex min-h-[48px] items-center justify-between rounded-xl bg-ink-900 px-5 py-3 font-display text-sm font-bold text-white transition hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                This weekend
                <ArrowRight aria-hidden className="h-4 w-4 text-gold-400" />
              </Link>
            </li>
            <li>
              <Link
                href="/events"
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-ink-200 bg-white px-5 py-3 font-display text-sm font-bold text-ink-900 transition hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                All events
                <ArrowRight aria-hidden className="h-4 w-4 text-gold-700" />
              </Link>
            </li>
          </ul>
        </nav>
      </main>
    </div>
  )
}
