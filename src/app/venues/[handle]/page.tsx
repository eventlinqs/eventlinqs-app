import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { CityTileImage } from '@/components/media/CityTileImage'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { CityMap } from '@/components/features/city/city-map'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'

import { resolveVenueProfile, venueSlugify } from '@/lib/venues/resolver'
import { VenueSchemaJsonLd } from '@/components/features/venues/venue-schema-jsonld'
import { VenueProfileHero } from '@/components/features/venues/venue-profile-hero'
import { VenueAmenitiesGrid } from '@/components/features/venues/venue-amenities-grid'
import { VenueMobileStickyBar } from '@/components/features/venues/venue-mobile-sticky-bar'

export const revalidate = 300

interface Props {
  params: Promise<{ handle: string }>
}

interface VenueEventRow extends EventCardData {
  end_date?: string
  organisation?: { name: string; slug: string } | null
}

interface VenueOrganiserAggregate {
  slug: string
  name: string
  eventCount: number
  logoUrl: string | null
}

async function fetchVenueEventsByName(venueName: string) {
  const supabase = createPublicClient()
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), organisation:organisations(name, slug, logo_url), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'
  const nowIso = new Date().toISOString()
  const [upcoming, past] = await Promise.all([
    supabase
      .from('events')
      .select(baseSelect)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .ilike('venue_name', venueName)
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(24),
    supabase
      .from('events')
      .select(baseSelect)
      .eq('visibility', 'public')
      .ilike('venue_name', venueName)
      .lt('start_date', nowIso)
      .in('status', ['published', 'completed'])
      .order('start_date', { ascending: false })
      .limit(12),
  ])
  return {
    upcoming: ((upcoming.data ?? []) as unknown as VenueEventRow[]),
    past: ((past.data ?? []) as unknown as VenueEventRow[]),
  }
}

async function fetchSimilarVenues(currentHandle: string, city: string | null, capacity: number | null) {
  if (!city) return [] as { handle: string; name: string; capacity: number | null; image: string | null }[]
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('venues')
    .select('id, name, city, capacity, image_url')
    .eq('is_active', true)
    .ilike('city', `%${city}%`)
    .limit(20)
  return ((data ?? []) as { name: string; city: string | null; capacity: number | null; image_url: string | null }[])
    .map(v => ({
      handle: venueSlugify(v.name),
      name: v.name,
      capacity: v.capacity,
      image: v.image_url,
    }))
    .filter(v => v.handle !== currentHandle)
    .sort((a, b) => {
      // Sort by capacity proximity to current venue when both have it; otherwise alpha.
      if (capacity != null && a.capacity != null && b.capacity != null) {
        return Math.abs(a.capacity - capacity) - Math.abs(b.capacity - capacity)
      }
      return a.name.localeCompare(b.name)
    })
    .slice(0, 8)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const venue = await resolveVenueProfile(handle)
  if (!venue) return { title: 'Venue not found | EventLinqs' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const cityPart = venue.city ? ` - ${venue.city}` : ''
  const title = `${venue.name} - Events & Info${cityPart} - EventLinqs`

  const capacityPart = venue.capacity ? `Capacity ${venue.capacity.toLocaleString('en-AU')}. ` : ''
  const typePart = venue.venueType ? `${venue.venueType}. ` : ''
  const cityLine = venue.city ? `In ${venue.city}. ` : ''
  const description = (cityLine + capacityPart + typePart + (venue.description ?? '')).slice(0, 155)

  return {
    title,
    description,
    keywords: [venue.name, venue.city ?? '', 'venue', 'events', 'tickets'].filter(Boolean) as string[],
    alternates: { canonical: `/venues/${handle}` },
    openGraph: {
      title: venue.name,
      description,
      url: `${baseUrl}/venues/${handle}`,
      type: 'website',
      images: venue.imageUrl
        ? [{ url: venue.imageUrl, width: 1200, height: 630, alt: venue.name }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: venue.name,
      description,
      images: venue.imageUrl ? [venue.imageUrl] : [],
    },
  }
}

export default async function VenueProfilePage({ params }: Props) {
  const { handle } = await params
  const venue = await resolveVenueProfile(handle)
  if (!venue) notFound()

  const { upcoming, past } = await fetchVenueEventsByName(venue.name)

  // Aggregate organisers using this venue (top by event count).
  const orgCounts = new Map<string, VenueOrganiserAggregate>()
  for (const e of [...upcoming, ...past]) {
    const o = e.organisation
    if (!o?.slug) continue
    const cur = orgCounts.get(o.slug) ?? {
      slug: o.slug,
      name: o.name,
      eventCount: 0,
      logoUrl: (o as { logo_url?: string | null }).logo_url ?? null,
    }
    cur.eventCount += 1
    orgCounts.set(o.slug, cur)
  }
  const venueOrganisers = Array.from(orgCounts.values())
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 8)

  // Similar venues - same city, similar capacity.
  const similar = await fetchSimilarVenues(handle, venue.city, venue.capacity)

  const fullAddress = [venue.address, venue.city, venue.state, venue.country].filter(Boolean).join(', ') || null

  const directionsUrl = (() => {
    if (typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
      return `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`
    }
    if (fullAddress) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    }
    return null
  })()

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const upcomingForSchema = upcoming.slice(0, 12).map(e => ({
    slug: e.slug,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date ?? e.start_date,
    organizerName: e.organisation?.name ?? '',
    organizerSlug: e.organisation?.slug ?? '',
    coverImageUrl: e.cover_image_url,
  }))

  // Map pins: just the venue itself (single-pin map).
  const mapPins = typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
    ? [{
        id: 'venue',
        slug: handle,
        title: venue.name,
        date: '',
        suburb: venue.city,
        price: null,
        cover: venue.imageUrl,
        latitude: venue.latitude,
        longitude: venue.longitude,
      }]
    : []

  return (
    <>
      <VenueSchemaJsonLd venue={venue} upcomingEvents={upcomingForSchema} baseUrl={baseUrl} />
      <PageShell>
        {/* VP1 Hero */}
        <VenueProfileHero
          venueName={venue.name}
          city={venue.city}
          imageSrc={venue.imageUrl}
          capacity={venue.capacity}
          venueType={venue.venueType}
          directionsUrl={directionsUrl}
        />

        {/* VP2 Venue info */}
        <VenueAmenitiesGrid
          description={venue.description}
          capacity={venue.capacity}
          fullAddress={fullAddress}
          venueType={venue.venueType}
        />

        {/* VP3 Map - only when we have coords AND a Mapbox token */}
        {process.env.NEXT_PUBLIC_MAPBOX_TOKEN && typeof venue.latitude === 'number' && typeof venue.longitude === 'number' ? (
          <ContentSection surface="alt" width="wide" topBorder>
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Location
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Where {venue.name} is
              </h2>
            </div>
            <CityMap
              centerLng={venue.longitude}
              centerLat={venue.latitude}
              zoom={15}
              pins={mapPins}
              accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            />
          </ContentSection>
        ) : null}

        {/* VP4 Upcoming events */}
        <ContentSection id="upcoming-events" surface="base" width="wide" topBorder>
          {upcoming.length > 0 ? (
            <SnapRailScroller
              railLabel={`Upcoming events at ${venue.name}`}
              header={{
                eyebrow: 'Upcoming',
                title: `Upcoming events at ${venue.name}`,
                headerLink: { href: `/events?venue=${handle}`, label: 'View all' },
              }}
            >
              {upcoming.slice(0, 12).map(e => (
                <div key={e.id} className="w-[280px] shrink-0 snap-start">
                  <EventCard event={e} variant="rail" />
                </div>
              ))}
            </SnapRailScroller>
          ) : (
            <CategoryHeroEmpty
              eyebrow="UPCOMING"
              headline={`No upcoming events at ${venue.name} just yet.`}
              subhead={`Get notified when new events are listed.`}
              primaryAction={{ label: 'Browse all events', href: '/events' }}
              secondaryAction={{ label: 'Get directions', href: directionsUrl ?? '/events' }}
              trustPillars={[
                { icon: Zap as ComponentType<{ className?: string }>, label: 'New listings weekly' },
                { icon: Heart as ComponentType<{ className?: string }>, label: 'Free to follow' },
                { icon: Wallet as ComponentType<{ className?: string }>, label: 'Unsubscribe anytime' },
              ]}
            />
          )}
        </ContentSection>

        {/* VP5 Past events grid */}
        {past.length > 0 ? (
          <ContentSection surface="alt" width="wide" topBorder>
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Past events
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {venue.name} archive
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, 12).map(e => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </ContentSection>
        ) : null}

        {/* VP6 Organisers who use this venue */}
        {venueOrganisers.length >= 2 ? (
          <ContentSection surface="base" width="wide" topBorder>
            <SnapRailScroller
              railLabel={`Organisers using ${venue.name}`}
              header={{
                eyebrow: 'Who throws here',
                title: `Organisers using ${venue.name}`,
              }}
            >
              {venueOrganisers.map(o => (
                <Link
                  key={o.slug}
                  href={`/organisers/${o.slug}`}
                  className="group flex w-[260px] shrink-0 snap-start flex-col items-center gap-3 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <OrganiserAvatar src={o.logoUrl} name={o.name} size="md" />
                  <div>
                    <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                      {o.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {o.eventCount} {o.eventCount === 1 ? 'event' : 'events'} here
                    </p>
                  </div>
                </Link>
              ))}
            </SnapRailScroller>
          </ContentSection>
        ) : null}

        {/* VP7 Event types pills - drawn from past + upcoming */}
        {(() => {
          const types = new Map<string, number>()
          for (const e of [...upcoming, ...past]) {
            const n = e.category?.name
            if (n) types.set(n, (types.get(n) ?? 0) + 1)
          }
          const sorted = Array.from(types.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
          if (sorted.length < 2) return null
          return (
            <ContentSection surface="alt" width="default" topBorder>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Best for
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Event types at {venue.name}
              </h2>
              <ul role="list" className="mt-5 flex flex-wrap gap-2">
                {sorted.map(([label, count]) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    <span>{label}</span>
                    <span className="text-xs text-[var(--text-secondary)]">{count}</span>
                  </li>
                ))}
              </ul>
            </ContentSection>
          )
        })()}

        {/* VP8 Similar venues */}
        {similar.length >= 3 ? (
          <ContentSection surface="base" width="wide" topBorder>
            <SnapRailScroller
              railLabel={`Similar venues in ${venue.city ?? 'the area'}`}
              header={{
                eyebrow: 'Similar venues',
                title: `More venues in ${venue.city ?? 'the area'}`,
              }}
            >
              {similar.map(v => (
                <Link
                  key={v.handle}
                  href={`/venues/${v.handle}`}
                  className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {v.image ? (
                      <CityTileImage src={v.image} alt={v.name} />
                    ) : (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-navy-950), color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)))',
                        }}
                      />
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                      {v.name}
                    </p>
                    {v.capacity ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        Capacity {v.capacity.toLocaleString('en-AU')}
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </SnapRailScroller>
          </ContentSection>
        ) : null}

        {/* VP9 Mobile sticky bar */}
        <VenueMobileStickyBar venueName={venue.name} />
      </PageShell>
    </>
  )
}
