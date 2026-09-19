import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { SnapRailScroller } from '@/components/ui/snap-rail'
import { CityTileImage } from '@/components/media/CityTileImage'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'

import { OrganiserSchemaJsonLd } from '@/components/features/organisers/organiser-schema-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { OrganiserProfileHero } from '@/components/features/organisers/organiser-profile-hero'
import { FollowButton } from '@/components/features/follow/follow-button'
import { OrganiserBioSection } from '@/components/features/organisers/organiser-bio-section'
import { OrganiserEventTypesBreakdown } from '@/components/features/organisers/organiser-event-types-breakdown'
import { OrganiserContactPanel } from '@/components/features/organisers/organiser-contact-panel'
import { OrganiserMobileStickyBar } from '@/components/features/organisers/organiser-mobile-sticky-bar'
import { getCityPhoto } from '@/lib/images/city-photo'
import { citySlugify } from '@/components/features/community/cities-rail'
import { venueSlugify } from '@/lib/venues/resolver'
import { getSiteUrl } from '@/lib/site-url'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { stripMarkdown } from '@/lib/prose/markdown-subset'
import { getFoundingBadge } from '@/lib/organisers/founding-badge'
import { loadDiscoveryRows, countOrganiser } from '@/lib/seo/discovery-counts'
import { organiserIndexingFor } from '@/lib/seo/discovery-threshold'
import { WIDE_TILE_CELL , FLAT_RAIL_CELL , TEXT_CARD_CELL } from '@/lib/ui/rhythm'

export const revalidate = 300

interface Props {
  params: Promise<{ handle: string }>
}

interface OrganiserEventRow extends EventCardData {
  end_date?: string
}

/**
 * The organisation fields this PUBLIC page may read.
 *
 * Founder ruling 2026-08-08: id, name, slug, description, logo_url, website.
 * Enforced in the database by column privilege (migration
 * 20260808000010_rls_column_privilege_lockdown), so a `select('*')` here now
 * fails loudly with "permission denied for column email" rather than quietly
 * shipping every organiser's contact details and Stripe posture to the browser.
 * The explicit list below is what keeps that from happening.
 */
export interface PublicOrganisation {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  website: string | null
}

const PUBLIC_ORGANISATION_COLUMNS = 'id, name, slug, description, logo_url, website'

/**
 * EVERY ORGANISER PROFILE 404ed FOR ANONYMOUS VISITORS. Fixed 25 August 2026.
 *
 * This function selected the six public columns, which is correct, and then
 * filtered `.eq('status', 'active')`, which is not: `status` is one of the 28
 * columns migration 20260808000010 REVOKED from anon. Postgres refuses a query
 * that references a column the role cannot select ANYWHERE, including in a WHERE
 * clause, and it refuses it with `42501 permission denied for table
 * organisations` rather than naming the column.
 *
 * The `const { data } =` above discarded that error, so the page saw null, called
 * notFound(), and returned 404. Measured on TEST: all seven organiser slugs
 * tried returned 404, while /sitemap.xml advertised 38 of those URLs to Google.
 * A crawler following them spends the budget on nothing and learns the section
 * is unreliable, which is a direct tax on the SEO engine the growth plan runs on.
 *
 * THE FIX follows the precedent already set for the PUBLIC EVENT PAGE, recorded
 * in the no-unowned-organisation-read guard's admissions: there is no caller to
 * own anything, the reader is an anonymous visitor, so the privileged column is
 * read server-side with the admin client and COLLAPSED before it can travel. The
 * status never reaches the returned object and never crosses the client
 * boundary; the only thing that leaves this function is the same six public
 * fields it always returned.
 *
 * The public client is deliberately still used for the six-column read, so the
 * column lockdown continues to be enforced by the database on the fields that
 * actually get rendered.
 */
/**
 * A PAGE MAY NEVER ANSWER "THIS DOES NOT EXIST" BECAUSE IT COULD NOT ASK.
 * Close-out UX6, found by the gate on 10 September 2026.
 *
 * The indexing drive reported `/organisers/kit-presents-029298` in the sitemap
 * and answering 404. The organisation is real, `status = 'active'`, with a
 * published event still to come, and the same URL answers 200 on the next
 * request. The gate's own server log carries the cause, twice on the one
 * request, once for the metadata and once for the render:
 *
 *     [organiser-profile] status gate failed for kit-presents-029298:
 *       TypeError: fetch failed
 *       Caused by: SocketError: other side closed (UND_ERR_SOCKET)
 *
 * A stale pooled socket to Supabase. The read did not come back empty, it did
 * not come back at all, and both branches below turned that into `null`, which
 * the caller turns into `notFound()`. To a crawler following our own sitemap
 * that is not "try again later", it is "delete this from the index", and the
 * SEO engine the growth plan runs on is made of exactly these pages.
 *
 * The header above this function records the SAME class one layer down: a
 * discarded error becoming a silent 404 on every organiser profile. That fix
 * made the error visible. It still answered 404.
 *
 * TWO CHANGES, and the first is not a new invention. `withBuildRetry` already
 * exists for this, is already used by four discovery routes, and its
 * `isTransientPoolError` already matches `fetch failed` and `ECONNRESET`, so a
 * dropped keep-alive socket is retried rather than believed. And when the read
 * STILL fails, this throws instead of returning null: a 500 says "ask again",
 * which is true, where a 404 says something false and permanent. A genuinely
 * missing or inactive organisation still returns null and still 404s, because
 * that answer is the truth.
 */
class OrganiserReadFailed extends Error {
  constructor(slug: string, cause: unknown) {
    super(`[organiser-profile] could not read ${slug}; answering 500 rather than 404`)
    this.name = 'OrganiserReadFailed'
    this.cause = cause
  }
}

async function fetchOrganiser(slug: string): Promise<PublicOrganisation | null> {
  const admin = createAdminClient()
  const { data: gate, error: gateError } = await withBuildRetry(
    () =>
      admin
        .from('organisations')
        .select('id, status')
        .eq('slug', slug)
        .maybeSingle(),
    { label: `organiser status gate ${slug}` },
  )

  if (gateError) {
    console.error('[organiser-profile] status gate failed for %s:', slug, gateError)
    throw new OrganiserReadFailed(slug, gateError)
  }
  const row = gate as { id: string; status: string } | null
  if (!row || row.status !== 'active') return null

  const supabase = createPublicClient()
  const { data, error } = await withBuildRetry(
    () =>
      supabase
        .from('organisations')
        .select(PUBLIC_ORGANISATION_COLUMNS)
        .eq('id', row.id)
        .maybeSingle(),
    { label: `organiser public columns ${slug}` },
  )

  if (error) {
    // Never swallow this again. A discarded error here is what turned a
    // permission problem into a silent 404 on every organiser profile.
    console.error('[organiser-profile] public column read failed for %s:', slug, error)
    throw new OrganiserReadFailed(slug, error)
  }
  return (data as PublicOrganisation | null) ?? null
}

/**
 * How many past events the archive grid shows. It was the literal 12 inside
 * `.slice(0, 12)`; it is named because the reserved height is derived from
 * the same number.
 */
const PAST_EVENTS_SHOWN = 12

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
      .match(PUBLIC_EVENT_MATCH)
      .or(listingWindowOrPredicate(new Date(nowIso)))
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

  const baseUrl = getSiteUrl()
  const title = `${organisation.name} - Events & Profile - EventLinqs`
  // A meta description is a PLAIN-TEXT surface: strip the syntax so a bold
  // organiser name never reaches a search result as asterisks (UX1.1).
  const description = (stripMarkdown(organisation.description)
    ? stripMarkdown(organisation.description).slice(0, 155)
    : `${organisation.name} on EventLinqs. Browse upcoming events, follow new releases, and stay connected.`)
    .slice(0, 155)

  return {
    title,
    description,
    keywords: [organisation.name, 'organiser', 'events', 'tickets'],
    /*
     * SUBSTANCE, NOT STATUS (close-out SEO3 step 7).
     *
     * This route was classified ALWAYS, so every active organisation was offered
     * to Google whether or not there was anything on the page. The audit of
     * 13 September 2026 named /organisers/oanh: an active organisation with no
     * events on sale and no biography, which is a name and a logo, and is the
     * thin page Search Console reports back.
     *
     * A profile is indexable when it holds events at the owner's live threshold
     * OR when somebody has written a biography, which are the two ways a profile
     * is a page rather than a placeholder. The canonical is self-referencing in
     * both states, exactly as it is on every conditional discovery page, and the
     * sitemap asks the same question of the same numbers.
     */
    ...(await organiserIndexingFor(
      countOrganiser(await loadDiscoveryRows(), organisation.id),
      stripMarkdown(organisation.description ?? '').trim().length > 0,
      `/organisers/${organisation.slug}`,
    )),
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

  /* ONE array feeds both the reserved height and the cards: the section
   * declares the height of what it renders, not of what it was handed
   * (close-out C8B.3, 19 September 2026). */
  const pastShown = past.slice(0, PAST_EVENTS_SHOWN)

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
  // Close-out FO1: one of the first fifty, read on the server with the service
  // role so no column is granted to anon. The two reads are independent, so
  // they run together rather than one after the other.
  const [foundingBadge, cityImageEntries] = await Promise.all([
    getFoundingBadge(organisation.id),
    Promise.all(
      cities.slice(0, 12).map(async name => {
        const slug = citySlugify(name)
        return [name, slug, await getCityPhoto(slug)] as const
      }),
    ),
  ])

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

  const baseUrl = getSiteUrl()
  /*
   * SLUG AND TITLE, AND NOTHING ELSE, because nothing else may be emitted here.
   *
   * This projection used to carry startDate, endDate, venueCity and
   * coverImageUrl, and the schema component used them to build twelve nested
   * `Event` nodes. An organiser profile is a page that LISTS events, and
   * Google's event experience only supports a leaf page holding a single event
   * (SEO1 v2, FAULT THREE). Narrowing the projection is the control: a future
   * edit cannot rebuild those nodes here, because the data is no longer carried.
   *
   * The whole list is passed, not the first twelve, so the ItemList's
   * `numberOfItems` is the number the organiser actually has on sale rather than
   * the size of the sample the markup shows.
   */
  const upcomingForSchema = upcoming.map(e => ({ slug: e.slug, title: e.title }))

  return (
    <>
      <OrganiserSchemaJsonLd
        organisation={organisation}
        upcomingEvents={upcomingForSchema}
        baseUrl={baseUrl}
      />
      {/* SEO1 step 6: a BreadcrumbList on the organiser page, which had none.
        * TWO STEPS, NOT THREE, and that is deliberate. There is no organiser
        * DIRECTORY on this platform: /organisers is the marketing landing that
        * sells the product to an organiser, so naming it the parent of a
        * profile would put a misleading label on a link that goes somewhere
        * else. A trail with a step that lies is worse than a short one. */}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: organisation.name, url: `${baseUrl}/organisers/${organisation.slug}` },
        ]}
      />
      <PageShell>
        {/* OP1 Hero */}
        <OrganiserProfileHero
          name={organisation.name}
          coverImage={null}
          logoUrl={organisation.logo_url}
          subtitle={subtitle}
          founding={foundingBadge.isFounding}
          stats={[
            { label: totalEvents === 1 ? 'event' : 'events', value: totalEvents, icon: 'cal' },
            { label: cities.length === 1 ? 'city' : 'cities', value: cities.length, icon: 'pin' },
          ]}
          actionSlot={
            <FollowButton
              type="organiser"
              id={organisation.id}
              label="Follow"
            />
          }
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
                <div key={e.id} className={FLAT_RAIL_CELL}>
                  <EventCard event={e} variant="rail-flat" />
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
        {pastShown.length > 0 ? (
          <ContentSection
            surface="base"
            width="wide"
            topBorder
            intrinsicSize={eventGridIntrinsicSize(pastShown.length)}
          >
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                Past events
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {organisation.name} archive
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pastShown.map(e => (
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
                  className={`group block ${WIDE_TILE_CELL} overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-navy-950)]">
                    {img ? (
                      <CityTileImage src={img} alt={`${name} on EventLinqs`} layout="rail-wide-tile" />
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
                  className={`group flex ${TEXT_CARD_CELL} flex-col gap-2 rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg`}
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
          {/* email is intentionally null. Founder ruling 2026-08-08: the
              organiser's contact email is NOT a public field, so it is neither
              fetched nor rendered. The panel already treats email as optional
              and omits the mailto row, keeping the website link and the
              notify-me capture. Restoring a public contact channel is a
              deliberate opt-in field, never the raw organisations.email
              column. */}
          <OrganiserContactPanel
            organiserName={organisation.name}
            organiserSlug={organisation.slug}
            website={organisation.website}
            email={null}
          />
        </div>

        {/* OP10 Mobile sticky bar */}
        <OrganiserMobileStickyBar organiserName={organisation.name} />
      </PageShell>
    </>
  )
}
