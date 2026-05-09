import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
// PhotographicCultureHero is the generic flexible-copy variant (eyebrow / title /
// subtitle); PhotographicCityHero hardcodes "Events in {city}" which doesn't
// match the cities-index headline. Reuse the flexible component.
import { PhotographicCultureHero } from '@/components/templates/PhotographicCultureHero'
import { CityTileImage } from '@/components/media/CityTileImage'
import { getCityHeroPhoto, getCityPhoto } from '@/lib/images/city-photo'
import { getCityIndexEntries, type CityIndexEntry } from '@/lib/cities/index-page-data'

export const revalidate = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

export const metadata: Metadata = {
  title: 'Browse by City | EventLinqs',
  description: '20 cities across Australia, from Sydney and Melbourne to Hobart and Darwin. Find culturally-relevant events near you.',
  alternates: { canonical: '/cities' },
  openGraph: {
    title: 'Browse by City | EventLinqs',
    description: 'Find culturally-relevant events in 20 cities across Australia.',
    url: '/cities',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse by City | EventLinqs',
  },
}

export default async function CitiesIndexPage() {
  const [entries, heroImage] = await Promise.all([
    getCityIndexEntries(),
    getCityHeroPhoto('sydney'),
  ])

  const tier1 = entries.filter(e => e.tier === 1)
  const tier2 = entries.filter(e => e.tier === 2)

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'EventLinqs Cities',
    description: '20 cities across Australia where EventLinqs runs.',
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.name,
      url: `${SITE_URL}/city/${e.slug}`,
    })),
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',   item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: `${SITE_URL}/cities` },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">
        <PhotographicCultureHero
          eyebrow="Browse by city"
          title="20 cities. From Sydney to Hobart."
          subtitle="Find culturally-relevant events near you."
          imageSrc={heroImage}
        />

        <Section
          heading="Capital Cities"
          subheading="Eight capital and major metro markets. The platform launches with full event catalogues in each."
          tier={1}
        >
          <CitiesGrid entries={tier1} priority />
        </Section>

        <Section
          heading="Regional Cities"
          subheading="Twelve regional centres where culturally-relevant events deserve a stage as much as the capitals."
          tier={2}
        >
          <CitiesGrid entries={tier2} priority={false} />
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
      aria-labelledby={`cities-tier-${tier}-heading`}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
    >
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h2
          id={`cities-tier-${tier}-heading`}
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

function CitiesGrid({
  entries,
  priority,
}: {
  entries: CityIndexEntry[]
  priority: boolean
}) {
  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
    >
      {entries.map((entry, idx) => (
        <li key={entry.slug}>
          <CityTile entry={entry} priority={priority && idx < 4} />
        </li>
      ))}
    </ul>
  )
}

async function CityTile({
  entry,
  priority,
}: {
  entry: CityIndexEntry
  priority: boolean
}) {
  const image = await getCityPhoto(entry.slug)
  const countLabel =
    entry.eventCount > 0
      ? `${entry.eventCount} event${entry.eventCount === 1 ? '' : 's'}`
      : 'Coming soon'

  return (
    <Link
      href={`/city/${entry.slug}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-ink-200">
        {image ? (
          <CityTileImage src={image} alt={`${entry.name}, ${entry.state}`} priority={priority} />
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
            {entry.name}
          </p>
          <p className="mt-1 text-xs font-medium text-white/85 sm:text-sm">
            {entry.state}
          </p>
          {/* Frosted-glass pill background raises gold chip contrast
           *  from 3.8:1 to 9.4:1 worst case. */}
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
