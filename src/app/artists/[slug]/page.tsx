import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistBySlug, fetchArtistUpcomingShows, fetchArtistAttribution } from '@/lib/broadcast/artists'
import {
  fetchShowcaseArtistBySlug,
  fetchArtistCredits,
  type ShowcaseEmbed,
} from '@/lib/marketplace/showcase'
import { PERFORMANCE_TYPE_LABELS } from '@/lib/marketplace/gigs'
import { FollowButton } from '@/components/features/follow/follow-button'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { OrganiserProfileHero } from '@/components/features/organisers/organiser-profile-hero'
import { EventVideo } from '@/components/features/events/event-video'
import { StructuredRequestButton } from '@/components/marketplace/structured-request-button'
import { getCityPhoto } from '@/lib/images/city-photo'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

/**
 * The artist profile (SPEC 4.1): name, image, bio, links, and upcoming
 * shows. An artist exists on the platform independent of any single event.
 * Gated on broadcast_artists: while the stage is off the route is a real
 * 404, so nothing half-on ever faces a user.
 *
 * Presentation inherits the established profile pattern (the shared
 * OrganiserProfileHero banner and the organiser-profile shows rail), so the
 * artist surface carries the same premium treatment as every other profile.
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

async function fetchShowCards(
  admin: ReturnType<typeof createAdminClient>,
  eventIds: string[],
): Promise<EventCardData[]> {
  if (eventIds.length === 0) return []
  const { data } = await admin
    .from('events')
    .select(
      'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)',
    )
    .in('id', eventIds)
    .order('start_date', { ascending: true })
  return (data ?? []) as unknown as EventCardData[]
}

/** Best-effort click-to-play poster: a real YouTube thumb when derivable,
 * else the artist image, else licensed city photography. Never blank. */
function youtubePoster(embed: ShowcaseEmbed): string | null {
  if (embed.provider !== 'youtube') return null
  const id = embed.embedUrl.match(/\/embed\/([A-Za-z0-9_-]{11})/)?.[1]
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

export default async function ArtistProfilePage({ params }: Props) {
  const { slug } = await params
  if (!(await isFeatureEnabled('broadcast_artists'))) notFound()

  const admin = createAdminClient()
  const artist = await fetchArtistBySlug(admin, slug)
  if (!artist) notFound()

  const showcaseOn = await isFeatureEnabled('artist_showcase')
  const showcase = showcaseOn ? await fetchShowcaseArtistBySlug(admin, slug) : null

  const shows = await fetchArtistUpcomingShows(admin, artist.id)
  const showCards = await fetchShowCards(admin, shows.map((s) => s.eventId))
  const credits = showcaseOn ? await fetchArtistCredits(admin, artist.id) : []
  const draw = showcase?.draw_consent ? await fetchArtistAttribution(admin, artist.id) : null

  // Who is looking? An active organiser sees the structured booking control.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let viewerHasActiveOrg = false
  if (user && showcaseOn) {
    const { data: viewerOrg } = await admin
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    viewerHasActiveOrg = Boolean(viewerOrg)
  }
  const isOwnProfile = Boolean(user && artist.owner_user_id === user.id)

  const cityNames = new Set<string>()
  for (const card of showCards) if (card.venue_city) cityNames.add(card.venue_city)

  // The banner is real photography from the artist's next show; the shared
  // hero falls back to the navy gradient when no show carries an image, so
  // the surface is never a blank band.
  const coverImage =
    showCards.find((c) => c.cover_image_url)?.cover_image_url ?? null

  const typeLine = showcase?.performance_types.length
    ? showcase.performance_types.map((t) => PERFORMANCE_TYPE_LABELS[t]).join(' · ')
    : null
  const subtitle =
    artist.bio ??
    (typeLine
      ? `${typeLine} on EventLinqs.`
      : `${artist.name} on EventLinqs: their shows, their lineups, and tickets in one place.`)

  const fallbackPoster =
    artist.image_url ?? (await getCityPhoto(showcase?.city_slug ?? 'melbourne')) ?? coverImage ?? ''

  return (
    <PageShell>
      <OrganiserProfileHero
        name={artist.name}
        coverImage={coverImage}
        logoUrl={artist.image_url}
        subtitle={subtitle}
        stats={[
          {
            label: shows.length === 1 ? 'upcoming show' : 'upcoming shows',
            value: shows.length,
            icon: 'cal',
          },
          ...(cityNames.size > 0
            ? [
                {
                  label: cityNames.size === 1 ? 'city' : 'cities',
                  value: cityNames.size,
                  icon: 'pin' as const,
                },
              ]
            : []),
        ]}
        actionSlot={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
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
              {showcase?.available_for_booking && viewerHasActiveOrg && !isOwnProfile && (
                <StructuredRequestButton artistId={artist.id} artistName={artist.name} kind="booking" />
              )}
              {showcase?.mentor_open && user && !isOwnProfile && (
                <StructuredRequestButton artistId={artist.id} artistName={artist.name} kind="mentoring" />
              )}
            </div>
            {showcase && (showcase.available_for_booking || showcase.mentor_open) && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {showcase.available_for_booking && (
                  <span className="inline-flex items-center rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    Open to bookings
                  </span>
                )}
                {showcase.mentor_open && (
                  <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink-700">
                    Open to mentoring
                  </span>
                )}
                {showcase.pay_expectation && (
                  <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink-700">
                    {showcase.pay_expectation}
                  </span>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* The draw card: real attributed sales, shown with the performer's
          consent only. Measured, never estimated. */}
      {draw && (
        <ContentSection surface="base" width="wide" topBorder>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Proof of draw
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Tickets their sharing sold', value: draw.totals.tickets },
              { label: 'Link clicks', value: draw.totals.clicks },
              { label: 'Shows tracked', value: draw.shows.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-4 py-4">
                <p className="text-2xl font-bold text-ink-900">{s.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-600">
            Attributed through {artist.name}&apos;s own tracked links on EventLinqs. Shared with
            their consent.
          </p>
        </ContentSection>
      )}

      {/* Showcase: external video through the platform allowlist, click-to-play. */}
      {showcase && showcase.showcase_embeds.length > 0 && (
        <ContentSection surface="base" width="wide" topBorder>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Showcase
          </p>
          <h2 className="font-display text-2xl font-bold text-ink-900">Watch {artist.name}</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {showcase.showcase_embeds.map((embed) => (
              <EventVideo
                key={embed.embedUrl}
                embedUrl={embed.embedUrl}
                provider={embed.provider}
                poster={youtubePoster(embed) ?? fallbackPoster}
                title={artist.name}
              />
            ))}
          </div>
        </ContentSection>
      )}

      <ContentSection surface="alt" width="wide" topBorder>
        {showCards.length > 0 ? (
          <SnapRailScroller
            railLabel={`Upcoming shows from ${artist.name}`}
            containerBg="ink-100"
            header={{
              eyebrow: 'Upcoming',
              title: `Upcoming shows from ${artist.name}`,
            }}
          >
            {showCards.map((card) => (
              <div key={card.id} className="w-[280px] shrink-0 snap-start">
                <EventCard event={card} variant="rail" />
              </div>
            ))}
          </SnapRailScroller>
        ) : (
          <CategoryHeroEmpty
            eyebrow="UPCOMING"
            headline={`Nothing announced from ${artist.name} just yet.`}
            subhead={`Performers on EventLinqs get a profile, a place on every lineup they play, and the exact number of tickets their sharing sold. Follow ${artist.name} and you hear the moment the next show lands.`}
            primaryAction={{ label: 'Browse events', href: '/events' }}
          />
        )}
      </ContentSection>

      {/* Credits: auto-populated from real tagged shows, never hand-typed. */}
      {credits.length > 0 && (
        <ContentSection surface="base" width="wide" topBorder>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Credits
          </p>
          <h2 className="font-display text-2xl font-bold text-ink-900">
            Where {artist.name} has played
          </h2>
          <ul className="mt-5 divide-y divide-ink-200/60 rounded-xl border border-ink-200 bg-white">
            {credits.map((credit) => (
              <li key={credit.eventId}>
                <Link
                  href={`/events/${credit.slug}`}
                  className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-ink-100"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-900">{credit.title}</span>
                    <span className="block text-xs text-ink-600">{credit.venueLabel}</span>
                  </span>
                  <span className="text-sm font-medium text-gold-800">
                    {new Date(credit.startDate).toLocaleDateString('en-AU', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ContentSection>
      )}
    </PageShell>
  )
}
