import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistBySlug, fetchArtistUpcomingShows } from '@/lib/broadcast/artists'
import { FollowButton } from '@/components/features/follow/follow-button'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

/**
 * The artist profile (SPEC 4.1): name, image, bio, links, and upcoming
 * shows. An artist exists on the platform independent of any single event.
 * Gated on broadcast_artists: while the stage is off the route is a real
 * 404, so nothing half-on ever faces a user.
 */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!(await isFeatureEnabled('broadcast_artists'))) {
    return { title: 'Not found | EventLinqs' }
  }
  const admin = createAdminClient()
  const artist = await fetchArtistBySlug(admin, slug)
  if (!artist) return { title: 'Not found | EventLinqs' }
  return {
    title: `${artist.name} | Artists | EventLinqs`,
    description:
      artist.bio?.slice(0, 155) ?? `${artist.name} on EventLinqs: upcoming shows and tickets.`,
    alternates: { canonical: `/artists/${artist.slug}` },
  }
}

export default async function ArtistProfilePage({ params }: Props) {
  const { slug } = await params
  if (!(await isFeatureEnabled('broadcast_artists'))) notFound()

  const admin = createAdminClient()
  const artist = await fetchArtistBySlug(admin, slug)
  if (!artist) notFound()

  const shows = await fetchArtistUpcomingShows(admin, artist.id)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start gap-6">
            <OrganiserAvatar src={artist.image_url} name={artist.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                Artist
              </p>
              <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                {artist.name}
              </h1>
              {artist.bio && <p className="mt-3 max-w-2xl text-base text-ink-600">{artist.bio}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <FollowButton type="artist" id={artist.id} />
                {Object.entries(artist.links).map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold capitalize text-ink-900 transition-colors hover:border-gold-800"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12">
            <h2 className="border-t border-ink-200 pt-6 text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
              Upcoming shows
            </h2>
            {shows.length === 0 ? (
              <p className="mt-4 text-sm text-ink-600">
                Nothing announced right now. Follow {artist.name} and you hear the moment the
                next show lands.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-ink-200/60 rounded-xl border border-ink-200 bg-white">
                {shows.map((show) => (
                  <li key={show.eventId}>
                    <Link
                      href={`/events/${show.slug}`}
                      className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-ink-100"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-900">{show.title}</span>
                        <span className="block text-xs text-ink-600">{show.venueLabel}</span>
                      </span>
                      <span className="text-sm font-medium text-gold-800">
                        {new Date(show.startDate).toLocaleDateString('en-AU', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: show.timezone ?? 'Australia/Sydney',
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
