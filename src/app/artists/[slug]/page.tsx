import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistBySlug, fetchArtistUpcomingShows } from '@/lib/broadcast/artists'
import { FollowButton } from '@/components/features/follow/follow-button'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { OrganiserProfileHero } from '@/components/features/organisers/organiser-profile-hero'

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

export default async function ArtistProfilePage({ params }: Props) {
  const { slug } = await params
  if (!(await isFeatureEnabled('broadcast_artists'))) notFound()

  const admin = createAdminClient()
  const artist = await fetchArtistBySlug(admin, slug)
  if (!artist) notFound()

  const shows = await fetchArtistUpcomingShows(admin, artist.id)
  const showCards = await fetchShowCards(admin, shows.map((s) => s.eventId))

  const cityNames = new Set<string>()
  for (const card of showCards) if (card.venue_city) cityNames.add(card.venue_city)

  // The banner is real photography from the artist's next show; the shared
  // hero falls back to the navy gradient when no show carries an image, so
  // the surface is never a blank band.
  const coverImage =
    showCards.find((c) => c.cover_image_url)?.cover_image_url ?? null

  const subtitle =
    artist.bio ??
    `${artist.name} on EventLinqs: their shows, their lineups, and tickets in one place.`

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
          </div>
        }
      />

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
    </PageShell>
  )
}
