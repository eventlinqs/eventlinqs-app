import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBuildRetry } from '@/lib/supabase/build-retry'
import {
  getFaith,
  getAllFaiths,
  isFaithSlug,
  buildFaithTagOrFilter,
} from '@/lib/faiths/data'
import { getCommunity } from '@/lib/communities/data'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { PhotographicCommunityHero } from '@/components/templates/PhotographicCommunityHero'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'

// ISR: 5-minute revalidate matches the rest of the public surface.
export const revalidate = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

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
  return {
    title,
    description,
    keywords: faith.keywords,
    alternates: { canonical: `/faith/${faith.slug}` },
    openGraph: { title, description, url: `/faith/${faith.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title },
  }
}

const EVENT_SELECT =
  'id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

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
          .eq('status', 'published')
          .eq('visibility', 'public')
          .gte('start_date', new Date().toISOString())
          .or(tagOr)
          .order('start_date', { ascending: true })
          .limit(12),
      { label: `faith/${faith.slug}` },
    )
    liveEvents = ((data ?? []) as unknown as EventCardData[]).slice(0, 12)
  }

  // Related heritages this faith commonly intersects (cross-link rail).
  const relatedHeritages = faith.relatedCommunities
    .map(slug => getCommunity(slug))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(c => ({ slug: c.slug, displayName: c.displayName }))

  // Hero image: best-effort via the strongest related heritage. The
  // hero renders a branded fallback when null (imagery polish: a
  // dedicated faith photo map is a follow-up).
  const heroImage = await getCommunityHeroPhoto(faith.relatedCommunities[0] ?? 'african')

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

        {/* Live events */}
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
          {liveEvents.length > 0 ? (
            <ul
              role="list"
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {liveEvents.map(e => (
                <li key={e.id}>
                  <EventCard event={e} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-ink-200 bg-surface-0 p-8 text-center">
              <p className="font-display text-lg font-bold text-ink-900">
                Be the first
              </p>
              <p className="mt-2 text-sm text-ink-600">
                No {faith.displayName} events are listed yet. If you run them,
                list with us and reach the community directly.
              </p>
              <Link
                href="/organisers"
                className="mt-4 inline-flex rounded-full bg-[var(--brand-accent)] px-5 py-2 text-sm font-semibold text-ink-900"
              >
                List your event
              </Link>
            </div>
          )}
        </section>

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

      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
    </div>
  )
}
