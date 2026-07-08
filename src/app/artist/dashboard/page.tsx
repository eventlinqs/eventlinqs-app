import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  fetchArtistAttribution,
  fetchArtistForOwner,
  fetchArtistUpcomingShows,
} from '@/lib/broadcast/artists'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { getSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Your artist dashboard | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ claimed?: string }>

/**
 * The artist attribution dashboard (SPEC 4.4, artist side): every show they
 * have played, their clicks and the tickets they drove through their own
 * tracked links, and per-show share links for their next announcement. The
 * portable proof of draw an artist shows the next organiser who considers
 * booking them.
 */
export default async function ArtistDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (!(await isFeatureEnabled('broadcast_artists'))) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/artist/dashboard')

  const admin = createAdminClient()
  const artist = await fetchArtistForOwner(admin, user.id)
  const { claimed } = await searchParams

  if (!artist) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <SiteHeader />
        <main id="main-content" className="flex-1">
          <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
            <h1 className="font-display text-3xl font-extrabold text-ink-900">
              Your artist dashboard
            </h1>
            <p className="mt-3 text-base text-ink-600">
              No artist profile is linked to your account yet. When an organiser tags you on a
              lineup they can send you a claim link, and claiming it unlocks your numbers here:
              every show, every click, every ticket you drove.
            </p>
            <Link
              href="/events"
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
            >
              Browse events
            </Link>
          </section>
        </main>
        <SiteFooter />
      </div>
    )
  }

  const [attribution, upcoming] = await Promise.all([
    fetchArtistAttribution(admin, artist.id),
    fetchArtistUpcomingShows(admin, artist.id, 6),
  ])

  // One tracked share link per upcoming show for the artist's own channels.
  const origin = getSiteUrl()
  const kits: { eventTitle: string; links: { channel: 'copy'; url: string }[] }[] = []
  for (const show of upcoming) {
    const link = await getOrCreateShareLink({
      eventId: show.eventId,
      channel: 'copy',
      artistId: artist.id,
      createdBy: user.id,
    })
    if (link) {
      kits.push({
        eventTitle: show.title,
        links: [{ channel: 'copy', url: buildShortUrl(origin, link.code) }],
      })
    }
  }

  const stats = [
    { label: 'Link clicks', value: attribution.totals.clicks },
    { label: 'Orders you drove', value: attribution.totals.conversions },
    { label: 'Tickets you drove', value: attribution.totals.tickets },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          {claimed === '1' && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-gold-400/40 bg-gold-100/60 px-4 py-3 text-sm text-ink-900"
            >
              Your artist profile is claimed. Your numbers build here from now on.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <OrganiserAvatar src={artist.image_url} name={artist.name} size="md" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                Artist dashboard
              </p>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
                {artist.name}
              </h1>
              <Link
                href={`/artists/${artist.slug}`}
                className="text-sm font-medium text-gold-800 underline hover:text-gold-700"
              >
                View your public profile
              </Link>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
                  {s.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-ink-900">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-200 px-5 py-4">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                Your draw, show by show
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Sales through your own tracked links. Show this to the next organiser who
                considers booking you.
              </p>
            </div>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th scope="col" className="px-5 py-3 font-medium">Show</th>
                  <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                  <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                  <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {attribution.shows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-ink-600">
                      Nothing measured yet. Share your link for an upcoming show below; every
                      click and ticket lands here.
                    </td>
                  </tr>
                ) : (
                  attribution.shows.map((show) => (
                    <tr key={show.eventId} className="border-b border-ink-200/60 last:border-b-0">
                      <td className="px-5 py-3">
                        <Link
                          href={`/events/${show.eventSlug}`}
                          className="font-semibold text-ink-900 hover:underline"
                        >
                          {show.eventTitle}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-900">{show.clicks}</td>
                      <td className="px-5 py-3 text-ink-900">{show.conversions}</td>
                      <td className="px-5 py-3 font-semibold text-ink-900">{show.tickets}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {kits.length > 0 && (
            <div className="mt-8 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                Your share links
              </h2>
              {kits.map((kit) => (
                <div key={kit.eventTitle} className="rounded-xl border border-ink-200 bg-white px-5 py-4">
                  <p className="text-sm font-semibold text-ink-900">{kit.eventTitle}</p>
                  <p className="mt-1 truncate text-xs text-ink-600">{kit.links[0]?.url}</p>
                  <p className="mt-2 text-xs text-ink-600">
                    One tap for your following: previews show your name on the card, and every
                    sale through it is credited to you.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
