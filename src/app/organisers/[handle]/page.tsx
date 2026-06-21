import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { CityTileImage } from '@/components/media/CityTileImage'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'

import { OrganiserSchemaJsonLd } from '@/components/features/organisers/organiser-schema-jsonld'
import { OrganiserProfileHero } from '@/components/features/organisers/organiser-profile-hero'
import { OrganiserBioSection } from '@/components/features/organisers/organiser-bio-section'
import { OrganiserEventTypesBreakdown } from '@/components/features/organisers/organiser-event-types-breakdown'
import { OrganiserContactPanel } from '@/components/features/organisers/organiser-contact-panel'
import { OrganiserMobileStickyBar } from '@/components/features/organisers/organiser-mobile-sticky-bar'
import { getCityPhoto } from '@/lib/images/city-photo'
import { citySlugify } from '@/components/features/community/cities-rail'
import { venueSlugify } from '@/lib/venues/resolver'
import type { Organisation } from '@/types/database'

export const revalidate = 300

interface Props {
  params: Promise<{ handle: string }>
}

interface OrganiserEventRow extends EventCardData {
  end_date?: string
}

async function fetchOrganiser(slug: string): Promise<Organisation | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('organisations')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  return (data as Organisation | null) ?? null
}

async function fetchOrganiserEvents(orgId: string) {
  const supabase = createPublicClient()
  const baseSelect =
    'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, venue_name, venue_city, venue_country, created_at, is_free, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'
  const nowIso = new Date().toISOString()

  const [upcomingResult, pastResult] = await Promise.all([
    supabase
      .from('events')
      .select(baseSelect)
      .eq('organisation_id', orgId)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(24),
    supabase
      .from('events')
      .select(baseSelect)
      .eq('organisation_id', orgId)
      .eq('visibility', 'public')
      .lt('start_date', nowIso)
      .in('status', ['published', 'completed'])
      .order('start_date', { ascending: false })
      .limit(12),
  ])

  return {
    upcoming: ((upcomingResult.data ?? []) as unknown as OrganiserEventRow[]),
    past: ((pastResult.data ?? []) as unknown as OrganiserEventRow[]),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const organisation = await fetchOrganiser(handle)
  if (!organisation) return { title: 'Organiser not found | EventLinqs' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const title = `${organisation.name} - Events & Profile - EventLinqs`
  const description = (organisation.description
    ? organisation.description.slice(0, 155)
    : `${organisation.name} on EventLinqs. Browse upcoming events, follow new releases, and stay connected.`)
    .slice(0, 155)

  return {
    title,
    description,
    keywords: [organisation.name, 'organiser', 'events', 'tickets'],
    alternates: { canonical: `/organisers/${organisation.slug}` },
    openGraph: {
      title: organisation.name,
      description,
      url: `${baseUrl}/organisers/${organisation.slug}`,
      type: 'profile',
      images: organisation.logo_url
        ? [{ url: organisation.logo_url, width: 1200, height: 630, alt: organisation.name }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: organisation.name,
      description,
      images: organisation.logo_url ? [organisation.logo_url] : [],
    },
  }
}

export default async function OrganiserProfilePage({ params }: Props) {
  const { handle } = await params
  const organisation = await fetchOrganiser(handle)
  if (!organisation) notFound()

  const { upcoming, past } = await fetchOrganiserEvents(organisation.id)

  // Stats: total events (upcoming + past), unique cities.
  const totalEvents = upcoming.length + past.length
  const cityNames = new Set<string>()
  for (const e of [...upcoming, ...past]) if (e.venue_city) cityNames.add(e.venue_city)
  const cities = Array.from(cityNames).sort()

  // Event-type breakdown across upcoming + past combined.
  const typeCounts = new Map<string, number>()
  for (const e of [...upcoming, ...past]) {
    const label = e.category?.name ?? 'Other'
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
  }
  const breakdown = Array.from(typeCounts.entries())
    .map(([label, count]) => ({ label, count, percent: (count / Math.max(1, totalEvents)) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Subtitle composition: prefer "[primary community] events in [primary city]"
  // when the data supports it, fall back to plain "[Organiser] on EventLinqs".
  const primaryCommunity = breakdown[0]?.label ?? null
  const primaryCity = cities[0] ?? null
  const subtitle = primaryCommunity && primaryCity
    ? `Throwing ${primaryCommunity.toLowerCase()} events in ${primaryCity}.`
    : `${organisation.name} on EventLinqs.`

  // Cities they organise in - photographic tiles (Pexels-backed).
  const cityImageEntries = await Promise.all(
    cities.slice(0, 12).map(async name => {
      const slug = citySlugify(name)
      return [name, slug, await getCityPhoto(slug)] as const
    }),
  )

  // OP7 (Batch 8.3 wire-up) - venues this organiser uses, ordered by
  // event count. Sourced from events.venue_name across upcoming + past.
  // The brief deferred this until /venues/[handle] existed; that route
  // ships in this same Batch 8.3 commit train.
  const venueCounts = new Map<string, { name: string; count: number }>()
  for (const e of [...upcoming, ...past]) {
    const vn = e.venue_name
    if (!vn) continue
    const cur = venueCounts.get(vn) ?? { name: vn, count: 0 }
    cur.count += 1
    venueCounts.set(vn, cur)
  }
  const organiserVenues = Array.from(venueCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(v => ({ name: v.name, count: v.count, handle: venueSlugify(v.name) }))

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const upcomingForSchema = upcoming.slice(0, 12).map(e => ({
    slug: e.slug,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date ?? e.start_date,
    venueCity: e.venue_city,
    coverImageUrl: e.cover_image_url,
  }))

  return (
    <>
      <OrganiserSchemaJsonLd
        organisation={organisation}
        upcomingEvents={upcomingForSchema}
        baseUrl={baseUrl}
      />
      <PageShell>
        {/* OP1 Hero */}
        <OrganiserProfileHero
          name={organisation.name}
          coverImage={null}
          logoUrl={organisation.logo_url}
          subtitle={subtitle}
          stats={[
            { label: totalEvents === 1 ? 'event' : 'events', value: totalEvents, icon: 'cal' },
            { label: cities.length === 1 ? 'city' : 'cities', value: cities.length, icon: 'pin' },
          ]}
        />

        {/* OP2 Bio */}
        <OrganiserBioSection
          organiserName={organisation.name}
          bio={organisation.description}
        />

        {/* OP3 Upcoming events rail */}
        <ContentSection surface="alt" width="wide" topBorder>
          {upcoming.length > 0 ? (
            <SnapRailScroller
              railLabel={`Upcoming events from ${organisation.name}`}
              containerBg="ink-100"
              header={{
                eyebrow: 'Upcoming',
                title: `Upcoming events from ${organisation.name}`,
                headerLink: { href: `/events?organiser=${organisation.slug}`, label: 'View all' },
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
              headline={`No upcoming events from ${organisation.name} just yet.`}
              subhead={`Get notified when new events drop.`}
              primaryAction={{ label: 'Get updates', href: '#stay-connected' }}
              secondaryAction={{ label: 'Browse all events', href: '/events' }}
              trustPillars={[
                { icon: Zap as ComponentType<{ className?: string }>, label: 'No spam, just events' },
                { icon: Heart as ComponentType<{ className?: string }>, label: 'Unsubscribe anytime' },
                { icon: Wallet as ComponentType<{ className?: string }>, label: 'Free to follow' },
              ]}
            />
          )}
        </ContentSection>

        {/* OP4 Past events grid - hide when none */}
        {past.length > 0 ? (
          <ContentSection surface="base" width="wide" topBorder>
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Past events
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {organisation.name} archive
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, 12).map(e => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </ContentSection>
        ) : null}

        {/* OP5 Event types breakdown - hide when fewer than 3 events */}
        {totalEvents >= 3 ? (
          <OrganiserEventTypesBreakdown organiserName={organisation.name} breakdown={breakdown} />
        ) : null}

        {/* OP6 Cities they organise in - hide when 1 or fewer */}
        {cities.length >= 2 ? (
          <ContentSection surface="base" width="wide" topBorder>
            <SnapRailScroller
              railLabel={`Cities ${organisation.name} organises in`}
              header={{
                eyebrow: 'Where they show up',
                title: `Cities ${organisation.name} organises in`,
              }}
            >
              {cityImageEntries.map(([name, slug, img]) => (
                <Link
                  key={slug}
                  href={`/city/${slug}`}
                  className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${name} on EventLinqs`} />
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
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                      style={{
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0) 100%)',
                      }}
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="font-display text-sm font-semibold text-white">{name}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </SnapRailScroller>
          </ContentSection>
        ) : null}

        {/* OP7 Venues this organiser uses (Batch 8.3 wire-up). Sourced
         *  from events.venue_name across upcoming + past, ordered by event
         *  count. Hidden when fewer than 2 distinct venues. */}
        {organiserVenues.length >= 2 ? (
          <ContentSection surface="alt" width="wide" topBorder>
            <SnapRailScroller
              railLabel={`Venues ${organisation.name} uses`}
              containerBg="ink-100"
              header={{
                eyebrow: 'Where they show up',
                title: `Venues ${organisation.name} uses`,
              }}
            >
              {organiserVenues.map(v => (
                <Link
                  key={v.handle}
                  href={`/venues/${v.handle}`}
                  className="group flex w-[260px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg sm:w-[280px]"
                >
                  <p className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {v.name}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {v.count} {v.count === 1 ? 'event' : 'events'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent-strong)]">
                    View venue &rarr;
                  </p>
                </Link>
              ))}
            </SnapRailScroller>
          </ContentSection>
        ) : null}

        {/* OP9 Contact / email capture */}
        <div id="stay-connected">
          <OrganiserContactPanel
            organiserName={organisation.name}
            organiserSlug={organisation.slug}
            website={organisation.website}
            email={organisation.email}
          />
        </div>

        {/* OP10 Mobile sticky bar */}
        <OrganiserMobileStickyBar organiserName={organisation.name} />
      </PageShell>
    </>
  )
}
