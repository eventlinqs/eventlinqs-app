import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import type { Metadata } from 'next'
import { loadDiscoveryRows, countFaith } from '@/lib/seo/discovery-counts'
import { discoveryIndexingFor } from '@/lib/seo/discovery-threshold'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getFaith,
  getAllFaiths,
  isFaithSlug,
  buildFaithTagOrFilter,
} from '@/lib/faiths/data'
import { getCommunity } from '@/lib/communities/data'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { PhotographicCommunityHero } from '@/components/templates/PhotographicCommunityHero'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { getSiteUrl } from '@/lib/site-url'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { JsonLd } from '@/components/seo/json-ld'
import { FAITH_PHOTOS } from '@/lib/images/faith-photo'

// ISR: 5-minute revalidate matches the rest of the public surface.
export const revalidate = 300

const SITE_URL = getSiteUrl()

interface Props {
  params: Promise<{ faith: string }>
}

export function generateStaticParams() {
  return getAllFaiths().map(f => ({ faith: f.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { faith: faithParam } = await params
  const faith = getFaith(faithParam)
  if (!faith) return { title: 'Not Found | EventLinqs' }
  const title = `${faith.displayName} events | EventLinqs`
  const description = faith.heroBody.slice(0, 155)
  // INDEXABLE ONLY WHILE IT HOLDS EVENTS (close-out C19.3).
  const eventCount = countFaith(await loadDiscoveryRows(), faith.slug)
  return {
    title,
    description,
    keywords: faith.keywords,
    ...(await discoveryIndexingFor(eventCount, `/faith/${faith.slug}`)),
    openGraph: { title, description, url: `/faith/${faith.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title },
  }
}

const EVENT_SELECT =
  'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, entry_mode, is_free, external_ticket_url, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

export default async function FaithPage({ params }: Props) {
  const { faith: faithParam } = await params
  if (!isFaithSlug(faithParam)) notFound()
  const faith = getFaith(faithParam)!

  const supabase = createPublicClient()
  const tagOr = buildFaithTagOrFilter(faith.slug)

  let liveEvents: EventCardData[] = []
  if (tagOr !== null) {
    const { data } = await withBuildRetry(
      () =>
        supabase
          .from('events')
          .select(EVENT_SELECT)
          .match(PUBLIC_EVENT_MATCH)
          .or(listingWindowOrPredicate(new Date()))
          .or(tagOr)
          .order('start_date', { ascending: true })
          .limit(12),
      { label: `faith/${faith.slug}` },
    )
    liveEvents = await withVenuePhotos(((data ?? []) as unknown as EventCardData[]).slice(0, 12))
  }

  // Related heritages this faith commonly intersects (cross-link rail).
  const relatedHeritages = faith.relatedCommunities
    .map(slug => getCommunity(slug))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(c => ({ slug: c.slug, displayName: c.displayName }))

  // ONE PHOTO, ONE SUBJECT (Lawal's standing directive of 31 October 2026; the photo system's A1): the faith's own
  // photograph (src/lib/images/faith-photo.ts), never a community's, credited under the hero as its licence asks.
  const heroPhoto = FAITH_PHOTOS[faith.slug]
  const heroImage = heroPhoto.src

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${faith.displayName} events on EventLinqs`,
    description: faith.heroBody,
    url: `${SITE_URL}/faith/${faith.slug}`,
    inLanguage: 'en-AU',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: liveEvents.length,
      itemListElement: liveEvents.slice(0, 12).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/events/${e.slug}`,
        name: e.title,
      })),
    },
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <PhotographicCommunityHero
          eyebrow="Faith community"
          title={faith.heroHeadline}
          subtitle={faith.heroBody}
          imageSrc={heroImage}
        />
        <p className="mx-auto mt-2 max-w-7xl px-4 text-xs font-semibold text-ink-600 sm:px-6 lg:px-8">
          Photo: <a href={heroPhoto.filePage} className="underline underline-offset-2 hover:text-ink-900">{heroPhoto.author}</a>, <a href={heroPhoto.licenceUrl} className="underline underline-offset-2 hover:text-ink-900">{heroPhoto.licence}</a>
        </p>

        {/* Story */}
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            {faith.tagline}
          </p>
          <p className="mb-6 text-sm text-ink-500">{faith.censusNote}</p>
          <div className="space-y-5">
            {faith.storyParagraphs.map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-ink-700">
                {p}
              </p>
            ))}
          </div>
        </section>

        {/* Community moments */}
        <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
          <h2 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            Major moments
          </h2>
          <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {faith.moments.map(m => (
              <li
                key={m.label}
                className="rounded-2xl border border-ink-200 bg-surface-0 p-5"
              >
                <p className="font-display text-lg font-bold text-ink-900">{m.label}</p>
                <p className="mt-1 text-sm text-ink-600">{m.blurb}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Live events. With none, one honest line and a link to real events, no heading over nothing and no
            invitation (Lawal's directive of 31 October 2026, section 11). */}
        {liveEvents.length > 0 ? (
          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
                Live {faith.displayName} events
              </h2>
              <Link
                href={`/events?faith=${faith.slug}`}
                className="shrink-0 text-sm font-semibold text-[var(--brand-accent-strong)] hover:underline"
              >
                View all
              </Link>
            </div>
            <ul
              role="list"
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {liveEvents.map(e => (
                <li key={e.id}>
                  <EventCard event={e} variant="grid-one-two-four" />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <EmptyCollectionNote message={`No ${faith.displayName} events are listed yet.`} />
          </section>
        )}

        {/* Related heritages */}
        {relatedHeritages.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <h2 className="mb-5 font-display text-xl font-extrabold tracking-tight text-ink-900">
              Communities within {faith.displayName}
            </h2>
            <div className="flex flex-wrap gap-3">
              {relatedHeritages.map(h => (
                <Link
                  key={h.slug}
                  href={`/community/${h.slug}`}
                  className="rounded-full border border-ink-200 bg-surface-0 px-4 py-2 text-sm font-medium text-ink-800 hover:border-[var(--brand-accent)]"
                >
                  {h.displayName}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />

      {/* An empty ItemList is markup that asserts a list and lists nothing.
        *  Found across 488 published URLs on 8 September 2026 by
        *  scripts/verify/structured-data-validate.mjs (close-out C19.4). The
        *  page keeps its breadcrumb and the site-wide Organization and WebSite;
        *  only the claim it cannot support is withheld. */}
      {liveEvents.length > 0 && (
        <JsonLd payload={collectionLd} />
      )}
    </div>
  )
}
