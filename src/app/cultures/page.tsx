import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { PhotographicCultureHero } from '@/components/templates/PhotographicCultureHero'
import { CategoryTileImage } from '@/components/media/CategoryTileImage'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getCultureIndexEntries, type CultureIndexEntry } from '@/lib/cultures/index-page-data'

// ISR: 5-minute revalidate matches the rest of the public surface.
export const revalidate = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

export const metadata: Metadata = {
  title: 'Browse by Culture | EventLinqs',
  description: 'Browse 14 cultural communities across Australia and beyond. Afrobeats, Bollywood, K-Pop, Latin, Caribbean, Filipino, Mediterranean and more.',
  alternates: { canonical: '/cultures' },
  openGraph: {
    title: 'Browse by Culture | EventLinqs',
    description: 'Every culture. Every event. One platform.',
    url: '/cultures',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse by Culture | EventLinqs',
  },
}

/**
 * Optional Tier 2 long-form descriptors used only on the index page card
 * subtitle. The /culture/[slug] landing keeps the short displayName + tagline.
 */
const TIER2_DESCRIPTOR: Partial<Record<string, string>> = {
  pride:    'Pride and Inclusion',
  gospel:   'Gospel and Worship',
  comedy:   'Comedy',
  wellness: 'Wellness and Spirituality',
}

export default async function CulturesIndexPage() {
  const [entries, heroImage] = await Promise.all([
    getCultureIndexEntries(),
    getCultureHeroPhoto('african'),
  ])

  const tier1 = entries.filter(e => e.tier === 1)
  const tier2 = entries.filter(e => e.tier === 2)

  // Schema.org BreadcrumbList + ItemList for the 14 cultures.
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'EventLinqs Cultures',
    description: 'Browse 14 cultural communities across Australia and beyond.',
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.displayName,
      url: `${SITE_URL}/culture/${e.slug}`,
    })),
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',     item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Cultures', item: `${SITE_URL}/cultures` },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <PhotographicCultureHero
          eyebrow="Browse by culture"
          title="Every culture. Every event."
          subtitle="Browse 14 communities across Australia and beyond. Find what moves you."
          imageSrc={heroImage}
        />

        <Section
          heading="Cultural Communities"
          subheading="Ten communities at the heart of the platform. Each gets its own landing with rails, sub-cultures, and city pages."
          tier={1}
        >
          <CulturesGrid entries={tier1} priority />
        </Section>

        <Section
          heading="Cross-Cultural"
          subheading="Communities the platform serves alongside the core ten."
          tier={2}
        >
          <CulturesGrid entries={tier2} priority={false} />
        </Section>
      </main>
      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </div>
  )
}

function Section({
  heading,
  subheading,
  tier,
  children,
}: {
  heading: string
  subheading: string
  tier: 1 | 2
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`cultures-tier-${tier}-heading`}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
    >
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h2
          id={`cultures-tier-${tier}-heading`}
          className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl lg:text-4xl"
        >
          {heading}
        </h2>
        <p className="mt-3 text-sm text-ink-600 sm:text-base">{subheading}</p>
      </div>
      {children}
    </section>
  )
}

function CulturesGrid({
  entries,
  priority,
}: {
  entries: CultureIndexEntry[]
  priority: boolean
}) {
  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5"
    >
      {entries.map((entry, idx) => (
        <li key={entry.slug}>
          <CultureTile entry={entry} priority={priority && idx < 4} />
        </li>
      ))}
    </ul>
  )
}

async function CultureTile({
  entry,
  priority,
}: {
  entry: CultureIndexEntry
  priority: boolean
}) {
  const image = await getCultureHeroPhoto(entry.slug)
  const subtitle = TIER2_DESCRIPTOR[entry.slug] ?? entry.tagline
  // Never render a dead "Coming soon" state. When a culture has no live
  // events yet, the landing is still a real, useful page (sub-cultures,
  // cities, organiser invite), so the tile invites the first organiser
  // rather than advertising absence.
  const countLabel =
    entry.eventCount > 0
      ? `${entry.eventCount} event${entry.eventCount === 1 ? '' : 's'}`
      : 'Be the first'

  return (
    <Link
      href={`/culture/${entry.slug}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-ink-200">
        {image ? (
          <CategoryTileImage src={image} alt={`${entry.displayName} culture`} priority={priority} />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
            }}
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.0) 35%, rgba(10,22,40,0.55) 70%, rgba(10,22,40,0.92) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">
            {entry.displayName}
          </p>
          <p className="mt-1 text-xs font-medium text-white/85 sm:text-sm">{subtitle}</p>
          {/* Frosted-glass pill background raises the gold chip
           *  contrast from 3.8:1 to 9.4:1 worst case (gold #E8B738 over
           *  navy `rgba(10,22,40,0.55)` with 12px backdrop-blur). */}
          <p
            className="mt-2 inline-flex items-center self-start rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]"
            style={{
              background: 'rgba(10, 22, 40, 0.55)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(212, 164, 55, 0.35)',
            }}
          >
            {countLabel}
          </p>
        </div>
        <div
          aria-hidden
          className="absolute inset-0 ring-0 ring-[var(--brand-accent)]/0 transition-all duration-300 group-hover:ring-2 group-hover:ring-[var(--brand-accent)]/60 motion-reduce:transition-none"
          style={{ borderRadius: '1rem' }}
        />
      </div>
    </Link>
  )
}
