import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchArtistBySlug } from '@/lib/broadcast/artists'
import { RedirectNow } from '@/components/broadcast/redirect-now'

export const revalidate = 300

type Props = { params: Promise<{ slug: string; artist: string }> }

/**
 * The artist share landing (SPEC 4.3): the URL behind an artist-tagged
 * short link. Its whole job is metadata: the "[Artist] live at [Event]"
 * share-card variant for link previews. Humans are redirected straight to
 * the event page client side, with a visible link as the no-JS fallback.
 * Canonical points at the event page and the route is noindex, so search
 * engines never treat it as a duplicate.
 */

async function loadPair(slug: string, artistSlug: string) {
  const admin = createAdminClient()
  const [{ data: event }, artist] = await Promise.all([
    admin
      .from('events')
      .select('id, slug, title, status')
      .eq('slug', slug)
      .maybeSingle(),
    fetchArtistBySlug(admin, artistSlug),
  ])
  if (!event || event.status !== 'published' || !artist) return null
  return { event, artist }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, artist: artistSlug } = await params
  const pair = await loadPair(slug, artistSlug)
  if (!pair) return { title: 'Event not found | EventLinqs' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const title = `${pair.artist.name} live at ${pair.event.title} | EventLinqs`
  const description = `${pair.artist.name} plays ${pair.event.title}. Tickets on EventLinqs.`
  const ogImage = `${baseUrl}/api/og/event/${slug}?artist=${encodeURIComponent(artistSlug)}`

  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `/events/${slug}` },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/events/${slug}`,
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function ArtistShareLandingPage({ params }: Props) {
  const { slug, artist: artistSlug } = await params
  const pair = await loadPair(slug, artistSlug)
  if (!pair) notFound()

  const eventUrl = `/events/${slug}`

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <RedirectNow to={eventUrl} />
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
          {pair.artist.name} live at
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-ink-900">
          {pair.event.title}
        </h1>
        <p className="mt-4 text-sm text-ink-600">Taking you to the event.</p>
        <Link
          href={eventUrl}
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
        >
          View the event
        </Link>
      </div>
    </main>
  )
}
