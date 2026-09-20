import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { AccessibilitySection } from '@/components/features/accessibility/accessibility-section'
import { readVenueAccessibility } from '@/lib/accessibility/read'
import { hasAccessibilityInfo, NO_ACCESSIBILITY_INFO } from '@/lib/accessibility/fields'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { CityTileImage } from '@/components/media/CityTileImage'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'
import { VenueMap } from '@/components/features/events/venue-map'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import { cache, type ComponentType } from 'react'

import { resolveVenueProfile, venueSlugify } from '@/lib/venues/resolver'
import { VenueSchemaJsonLd } from '@/components/features/venues/venue-schema-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { VenueProfileHero } from '@/components/features/venues/venue-profile-hero'
import { VenueAmenitiesGrid } from '@/components/features/venues/venue-amenities-grid'
import { VenueMobileStickyBar } from '@/components/features/venues/venue-mobile-sticky-bar'
import { getSiteUrl } from '@/lib/site-url'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { formatVenueAddress } from '@/lib/venues/format-venue-address'
import { WIDE_TILE_CELL , FLAT_RAIL_CELL , TEXT_CARD_CELL } from '@/lib/ui/rhythm'

export const revalidate = 300

/*
 * MEASURED ON 21 SEPTEMBER 2026, close-out C8 clause C8B.3. Counted at the
 * global fetch on a production build against TEST
 * (scripts/verify/lib/count-supabase-reads.mjs), one view of
 * /venues/170-russell made 9 PostgREST calls of which only 6 were distinct.
 * All three repeats were inside `resolveVenueProfile`: the venues list, the
 * venue-name event scan and the geo/city event read, each bought once for the
 * head and once for the body of the same page.
 */

/**
 * READ ONCE PER REQUEST.
 *
 * `generateMetadata` renders the head and the default export renders the body,
 * from the same request, and both need this. Next's own reference expects the
 * second one to be free ("fetch requests are automatically memoized for the
 * same data across generateMetadata ... React `cache` can be used if `fetch` is
 * unavailable", node_modules/next/dist/docs/01-app/03-api-reference/
 * 04-functions/generate-metadata.md, Next 16.3.0). On this platform it is not:
 * every Supabase request carries its own AbortSignal so that a retry inside a
 * render is a real second request, and a signal is that deduplicator's
 * documented opt-OUT (src/lib/supabase/undeduped-fetch.ts). So the memo has to
 * be asked for, and React's `cache` is the mechanism the reference names. It
 * memoises for ONE request: no TTL, nothing shared between requests or viewers.
 *
 * THE WRAPPER LIVES HERE AND NOT IN THE LIBRARY DELIBERATELY. The duplication
 * is a property of THIS ROUTE, not of the reader, and the reader is imported by
 * unit tests that run outside any React request scope.
 */
const venueForRoute = cache(resolveVenueProfile)

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

/**
 * How many past events the archive grid shows. It was the literal 12 inside
 * `.slice(0, 12)`; it is named because the reserved height is derived from
 * the same number.
 */
const PAST_EVENTS_SHOWN = 12

async function fetchVenueEventsByName(venueName: string) {
  const supabase = createPublicClient()
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), organisation:organisations(name, slug, logo_url), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'
  const nowIso = new Date().toISOString()
  const [upcoming, past] = await Promise.all([
    supabase
      .from('events')
      .select(baseSelect)
      .match(PUBLIC_EVENT_MATCH)
      .ilike('venue_name', venueName)
      .or(listingWindowOrPredicate(new Date(nowIso)))
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
  const venue = await venueForRoute(handle)
  if (!venue) return { title: 'Venue not found | EventLinqs' }

  const baseUrl = getSiteUrl()
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
  const venue = await venueForRoute(handle)
  if (!venue) notFound()

  const { upcoming, past } = await fetchVenueEventsByName(venue.name)

  /* ONE array feeds both the reserved height and the cards: the section
   * declares the height of what it renders, not of what it was handed
   * (close-out C8B.3, 19 September 2026). */
  const pastShown = past.slice(0, PAST_EVENTS_SHOWN)

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

  /*
   * What this venue has told us about access (close-out SEO5 step 4). Returns
   * nothing, rather than throwing, when the columns are not there yet.
   *
   * BEHIND THE SAME ONE FLAG AS THE EVENT PAGE. SEO5's reversal condition is
   * "one flag hides the availability indicator and the accessibility section",
   * and a reversal that left half the platform still making access claims would
   * not be a reversal. The read is skipped entirely when it is off, so turning
   * it off also removes the round trip.
   */
  const venueAccessibility = (await isFeatureEnabled('event_availability_and_access'))
    ? await readVenueAccessibility(venue.id)
    : NO_ACCESSIBILITY_INFO

  // UX1.2: the venue name is already the page heading, so this is the
  // address-only form, composed by the one formatter.
  const fullAddress = formatVenueAddress({
    name: venue.name,
    address: venue.address,
    city: venue.city,
    state: venue.state,
    country: venue.country,
  })

  const directionsUrl = (() => {
    if (typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
      return `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`
    }
    if (fullAddress) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    }
    return null
  })()

  const baseUrl = getSiteUrl()
  /*
   * SLUG AND TITLE, AND NOTHING ELSE. This projection used to carry the dates,
   * the cover image and the organiser, and the schema component built twelve
   * nested `Event` nodes from them. A venue profile is a page that LISTS events
   * and must not carry Event markup for them (SEO1 v2, FAULT THREE). Narrowing
   * the projection is what stops a later edit rebuilding them.
   *
   * The whole list is passed rather than the first twelve, so `numberOfItems`
   * on the emitted ItemList is the number the venue actually has on.
   */
  const upcomingForSchema = upcoming.map(e => ({ slug: e.slug, title: e.title }))

  return (
    <>
      <VenueSchemaJsonLd venue={venue} upcomingEvents={upcomingForSchema} baseUrl={baseUrl} />
      {/* SEO1 step 6: a BreadcrumbList on the venue page, which had none.
        * TWO STEPS, because there is no /venues index route to be the parent
        * (src/app/venues holds [handle] alone). Law 5 is zero dead links, and a
        * breadcrumb item URL is a link: inventing the step would put a 404 into
        * the markup Google crawls. */}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: venue.name, url: `${baseUrl}/venues/${handle}` },
        ]}
      />
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

        {/*
          VP2b ACCESSIBILITY (close-out SEO5 step 4).

          Read in its own query rather than added to the venue select, because
          that select names its columns and PostgREST fails the WHOLE query with
          42703 on a column it does not have. Adding these there would blank the
          venue page for every visitor until the founder applied
          docs/migrations-pending/20260914000002_accessibility_fields.sql.

          Renders nothing at all when the venue has said nothing, which is the
          owner's rule rather than a convenience: a heading over an empty card
          reads as "there is none" to the person who needs the answer most.
        */}
        {/* The wrapper is gated too, not only the section. A ContentSection is a
            padded band: rendering one around a component that returned null
            leaves a strip of empty page, which is the blank section under
            another name. `hasAccessibilityInfo` is the ONE emptiness test and
            both the wrapper and the component ask it. */}
        {hasAccessibilityInfo(venueAccessibility) && (
          <ContentSection surface="base" width="wide">
            <AccessibilitySection info={venueAccessibility} subject="venue" />
          </ContentSection>
        )}

        {/* VP3 Map - Google Maps venue location (one provider platform-wide) */}
        {typeof venue.latitude === 'number' && typeof venue.longitude === 'number' ? (
          <ContentSection surface="alt" width="wide" topBorder>
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Location
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Where {venue.name} is
              </h2>
            </div>
            <VenueMap
              venueName={venue.name}
              address={fullAddress}
              city={null}
              state={null}
              country={null}
              latitude={venue.latitude}
              longitude={venue.longitude}
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
                <div key={e.id} className={FLAT_RAIL_CELL}>
                  <EventCard event={e} variant="rail-flat" />
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
        {pastShown.length > 0 ? (
          <ContentSection
            surface="alt"
            width="wide"
            topBorder
            intrinsicSize={eventGridIntrinsicSize(pastShown.length)}
          >
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Past events
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {venue.name} archive
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pastShown.map(e => (
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
                  className={`group flex ${TEXT_CARD_CELL} flex-col items-center gap-3 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
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
                  className={`group block ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {v.image ? (
                      <CityTileImage src={v.image} alt={v.name} layout="rail-wide-tile" />
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
