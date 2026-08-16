import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { readDraftByCode } from '@/lib/launch/draft-store'
import { decodeBillRef } from '@/lib/launch/bill-ref'

/**
 * THE ACT'S LANDING PAGE. The structural half of the spread mechanic.
 *
 * FOUNDER RULING, 9 August 2026: this page, not the cards, is the mechanic.
 * The cards are the vehicle that gets a person here.
 *
 * Why this is structural where a card is not: a card needs the organiser to
 * press send. This page is reached by a link that exists and works whether or
 * not anybody chooses to promote us, and it is where a performer turns into an
 * organiser. The composer below is PRE-FILLED from the event they are already
 * on - same city, same venue, same kind of night, their own name in the title
 * - so their first run costs them a sentence instead of a form.
 *
 * The invitation is a by-product of the artefact, never a message. Nothing on
 * this page says "invite another organiser": the founder's own test is that if
 * any screen in this flow says that, the mechanic has failed.
 *
 * Always noindex: it references somebody's unpublished draft.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your link | EventLinqs',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default async function ActLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const ref = decodeBillRef(code)
  const draft = ref ? await readDraftByCode(ref.kitCode) : null

  // An unknown or expired reference is never a dead end. It offers the thing
  // the visitor would have wanted anyway.
  if (!draft || !ref) {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader staticSafe />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="font-headline text-2xl font-bold text-ink-900">
            This link has expired
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-600">
            Links keep working for thirty days. If you are putting something on
            yourself, building a kit takes about a minute.
          </p>
          <Link
            href="/launch"
            className="mt-7 inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800"
          >
            Build my kit
          </Link>
        </main>
        <SiteFooter />
      </div>
    )
  }

  const p = draft.payload
  const name = ref.name

  // The pre-fill: their name, the same room, the same kind of night. Written
  // as the sentence THEY would have typed, so the composer opens with a draft
  // rather than a blank field.
  const prefill = [
    `${name} at ${p.venueName || p.venueCity || 'your venue'}`,
    p.venueCity && p.venueName ? `in ${p.venueCity}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader staticSafe />
      <main className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-16 lg:px-12">
        <p
          className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]"
          style={{ fontWeight: 600 }}
        >
          Your link
        </p>
        <h1 className="mt-2 font-headline text-2xl font-bold text-ink-900 sm:text-3xl">
          {name}, you are on at {p.title || 'this one'}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-600">
          This link is yours. Anything that comes through it is counted as
          yours, so you can see what you brought in rather than guessing.
        </p>

        {/* Their number. Zero is shown as a beginning, never as four zeros. */}
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-headline text-base font-semibold text-ink-900">
            What your link has brought in
          </h2>
          <p className="mt-2 text-base text-ink-600">
            Nothing yet, because it has not been out there. The moment someone
            opens it, this starts counting.
          </p>
        </div>

        {/* The structural conversion: a composer already half-built for them. */}
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-headline text-lg font-semibold text-ink-900">
            Putting on your own night?
          </h2>
          <p className="mt-2 max-w-2xl text-base text-ink-600">
            We have started one for you with the room you are already playing.
            Change anything you like.
          </p>
          <Link
            href={`/launch?from=${encodeURIComponent(prefill)}`}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800"
          >
            Start mine
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
