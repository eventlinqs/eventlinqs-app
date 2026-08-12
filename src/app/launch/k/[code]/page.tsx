import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { readDraftByCode } from '@/lib/launch/draft-store'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import { toCaptionInput } from '@/lib/broadcast/kit-artefacts'
import { buildCaptions } from '@/lib/broadcast/captions'
import { getSiteUrl } from '@/lib/site-url'
import { DraftEventPreview } from '@/components/launch/draft-event-preview'
import { KitArtefacts, KitCaptions } from '@/components/launch/kit-artefacts'

/**
 * The bookmarkable kit link (founder ruling 0.2c: 30 days, no account).
 *
 * ALWAYS noindex. A draft is somebody's unpublished event, frequently at a
 * private address, and it must never enter a search index. This is the same
 * child-safety posture as the event page and is not conditional on the draft's
 * inferred visibility, because a draft is by definition unconfirmed.
 *
 * An expired or unknown code is NOT a dead end (Law 5). It explains itself in
 * one line and offers the composer, which is the thing the visitor wanted.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your launch kit | EventLinqs',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default async function KitPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const draft = await readDraftByCode(code)

  if (!draft) {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader staticSafe />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="font-headline text-2xl font-bold text-ink-900">
            This kit has expired
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-600">
            Kits keep working for thirty days. Building another one takes about
            a minute, and it is free.
          </p>
          <Link
            href="/launch"
            className="mt-7 inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800"
          >
            Build a kit
          </Link>
        </main>
        <SiteFooter />
      </div>
    )
  }

  const p = draft.payload

  // Deterministic, no model call, no network: the same six captions the reveal
  // showed when this kit was built.
  const captions = buildCaptions(
    toCaptionInput(
      buildDraftContext({
        payload: p,
        code: draft.code,
        origin: getSiteUrl(),
        organiserName: '',
      }),
    ),
  )

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader staticSafe />
      <main className="mx-auto max-w-7xl px-6 py-14 sm:px-8 sm:py-16 lg:px-12">
        <p
          className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]"
          style={{ fontWeight: 600 }}
        >
          Launch kit
        </p>
        <h1 className="mt-2 font-headline text-2xl font-bold text-ink-900 sm:text-3xl">
          {p.title || 'Your event'}
        </h1>
        {p.summary ? (
          <p className="mt-3 max-w-2xl text-base text-ink-600">{p.summary}</p>
        ) : null}

        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm text-ink-700">{p.visibilityReason}</p>
        </div>

        {/* The same kit, from the same components the reveal uses. Coming back
            to a bookmarked link and finding a summary instead of the kit would
            make the link worthless, which is the whole point of ruling 0.2c. */}
        <div className="mt-12">
          <h2 className="font-headline text-lg font-semibold text-ink-900">
            Your event page
          </h2>
          <div className="mt-5">
            <DraftEventPreview payload={p} />
          </div>
        </div>

        <KitArtefacts code={draft.code} />
        <KitCaptions captions={captions} />

        {/* The universal spread vector: whoever this was sent to can make one. */}
        <div className="mt-10 rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-headline text-lg font-semibold text-ink-900">
            Running something yourself?
          </h2>
          <p className="mt-2 max-w-2xl text-base text-ink-600">
            This kit was built from one sentence. Yours would take about the
            same.
          </p>
          <Link
            href="/launch"
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink-900 px-7 text-base font-semibold text-white transition hover:bg-ink-800"
          >
            Build my kit
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
