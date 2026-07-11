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
import { fetchArtistApplications, fetchArtistRequests } from '@/lib/marketplace/gigs'
import { fetchShowcaseArtistForOwner } from '@/lib/marketplace/showcase'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { CreateProfileForm } from '@/components/marketplace/create-profile-form'
import { RequestsPanel } from '@/components/marketplace/requests-panel'
import { ShowcaseEditor } from '@/components/marketplace/showcase-editor'
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
  const showcaseOn = await isFeatureEnabled('artist_showcase')
  const gigBoardOn = await isFeatureEnabled('gig_board')

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
              No artist profile is linked to your account yet.{' '}
              {showcaseOn
                ? 'Create one below, or claim the link an organiser sends when they tag you on a lineup. Either way your numbers build here: every show, every click, every ticket you drove.'
                : 'When an organiser tags you on a lineup they can send you a claim link, and claiming it unlocks your numbers here: every show, every click, every ticket you drove.'}
            </p>
            {showcaseOn ? (
              <CreateProfileForm />
            ) : (
              <Link
                href="/events"
                className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
              >
                Browse events
              </Link>
            )}
          </section>
        </main>
        <SiteFooter />
      </div>
    )
  }

  const [attribution, upcoming, applications, requests, showcase, citiesResult] = await Promise.all([
    fetchArtistAttribution(admin, artist.id),
    fetchArtistUpcomingShows(admin, artist.id, 6),
    gigBoardOn ? fetchArtistApplications(admin, artist.id) : Promise.resolve([]),
    gigBoardOn || showcaseOn ? fetchArtistRequests(admin, artist.id) : Promise.resolve([]),
    showcaseOn ? fetchShowcaseArtistForOwner(admin, user.id) : Promise.resolve(null),
    showcaseOn
      ? admin.from('cities').select('slug, name').order('tier').order('name')
      : Promise.resolve({ data: [] }),
  ])
  const cities = ((citiesResult as { data: unknown }).data ?? []) as { slug: string; name: string }[]

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

          {(gigBoardOn || showcaseOn) && (
            <div className="mt-8 overflow-hidden rounded-xl border border-ink-200 bg-white">
              <div className="border-b border-ink-200 px-5 py-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                  Booking and mentoring requests
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  Structured asks only: you see the gig, the terms, and the note, then accept or
                  decline in one tap.
                </p>
              </div>
              <RequestsPanel
                requests={requests.map((r) => ({
                  id: r.id,
                  kind: r.kind,
                  subject: r.subject,
                  note: r.note,
                  pay_type: r.pay_type,
                  pay_amount_cents: r.pay_amount_cents,
                  pay_note: r.pay_note,
                  proposed_date: r.proposed_date,
                  event_id: r.event_id,
                  status: r.status,
                  created_at: r.created_at,
                  organisationName: r.organisation?.name ?? null,
                }))}
              />
            </div>
          )}

          {gigBoardOn && (
            <div className="mt-8 overflow-hidden rounded-xl border border-ink-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                    Your gig applications
                  </h2>
                  <p className="mt-1 text-sm text-ink-600">
                    Every application carries your live numbers automatically.
                  </p>
                </div>
                <Link
                  href="/gigs"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  Browse open gigs
                </Link>
              </div>
              {applications.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-600">
                  No applications yet. Find a gig in your city and apply with your profile.
                </p>
              ) : (
                <ul className="divide-y divide-ink-200/60">
                  {applications.map((app) => (
                    <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        {app.gig ? (
                          <Link href={`/gigs/${app.gig.id}`} className="text-sm font-semibold text-ink-900 hover:underline">
                            {app.gig.title}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-ink-900">Gig no longer listed</p>
                        )}
                        <p className="mt-0.5 text-xs text-ink-600">
                          Applied{' '}
                          {new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(
                            new Date(app.created_at),
                          )}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          app.status === 'booked'
                            ? 'bg-success/15 text-success'
                            : app.status === 'shortlisted'
                              ? 'bg-gold-100 text-gold-800'
                              : app.status === 'declined'
                                ? 'bg-error/10 text-error'
                                : 'bg-ink-100 text-ink-700'
                        }`}
                      >
                        {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {showcaseOn && showcase && (
            <div className="mt-8">
              <ShowcaseEditor
                cities={cities}
                initial={{
                  bio: showcase.bio ?? '',
                  performanceTypes: showcase.performance_types,
                  genres: showcase.genres.join(', '),
                  citySlug: showcase.city_slug ?? '',
                  availableForBooking: showcase.available_for_booking,
                  payExpectation: showcase.pay_expectation ?? '',
                  embedUrls: showcase.showcase_embeds.map((e) => e.sourceUrl),
                  drawConsent: showcase.draw_consent,
                  mentorOpen: showcase.mentor_open,
                }}
              />
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
