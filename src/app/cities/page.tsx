import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
// PhotographicCommunityHero is the generic flexible-copy variant (eyebrow / title /
// subtitle); PhotographicCityHero hardcodes "Events in {city}" which doesn't
// match the cities-index headline. Reuse the flexible component.
import { PhotographicCommunityHero } from '@/components/templates/PhotographicCommunityHero'
import { CityTileImage } from '@/components/media/CityTileImage'
import { TileCaption } from '@/components/media/tile-caption'
import { getCityHeroPhoto, getCityPhoto } from '@/lib/images/city-photo'
import { getCityIndexEntries, type CityIndexEntry } from '@/lib/cities/index-page-data'
import { getSiteUrl } from '@/lib/site-url'
import { JsonLd } from '@/components/seo/json-ld'

export const revalidate = 300

const SITE_URL = getSiteUrl()

export const metadata: Metadata = {
  title: 'Browse by City | EventLinqs',
  description: '20 cities across Australia, from Sydney and Melbourne to Hobart and Darwin. Find community-relevant events near you.',
  alternates: { canonical: '/cities' },
  openGraph: {
    title: 'Browse by City | EventLinqs',
    description: 'Find community-relevant events in 20 cities across Australia.',
    url: '/cities',
    type: 'website',
    images: ['/opengraph-image'],
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
        <PhotographicCommunityHero
          eyebrow="Browse by city"
          title="20 cities. From Sydney to Hobart."
          subtitle="Find community-relevant events near you."
          imageSrc={heroImage}
        />

        <Section
          heading="Capital Cities"
          subheading="Eight capital and major metro markets, each with its own events directory and community rails."
          tier={1}
        >
          <CitiesGrid entries={tier1} priority />
        </Section>

        <Section
          heading="Regional Cities"
          subheading="Twelve regional centres where community-relevant events deserve a stage as much as the capitals."
          tier={2}
        >
          <CitiesGrid entries={tier2} priority={false} />
        </Section>
      </main>
      <SiteFooter />

      <JsonLd payload={itemListSchema} />
      <JsonLd payload={breadcrumbSchema} />
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
          <CityTile entry={entry} priority={priority && idx === 0} />
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
  // Never render a dead "Coming soon" state. A city with no live events
  // yet still has a real landing (community rails, formats, organiser
  // invite), so the tile invites the first organiser instead of
  // advertising absence.
  const countLabel =
    entry.eventCount > 0
      ? `${entry.eventCount} event${entry.eventCount === 1 ? '' : 's'}`
      : 'Be the first'

  return (
    <Link
      href={`/city/${entry.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-[var(--surface-0)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-200">
        {image ? (
          <CityTileImage src={image} alt={`${entry.name}, ${entry.state}`} layout="grid-two-three-four" priority={priority} />
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
        {/* THE PLACE NAME AND NOTHING ELSE, which is both laws at once.
         *
         *  This tile used to paint the name, the state AND the event-count pill
         *  on the photograph, under `rgba(10,22,40,0) 35%, 0.55 70%, 0.92 100%`
         *  - a percentage of the TILE. At 390 the tile is 173x108 and that
         *  caption measured 112px, taller than the tile it was anchored to, so
         *  the city name was painted at the very top of the picture where the
         *  ramp had not started: Brisbane 1.00:1 on a white sky, 100 per cent
         *  of its 464 core pixels below the WCAG 2.2 SC 1.4.3 floor.
         *
         *  Anchoring the wash to the label fixes the contrast and was driven
         *  doing so, but on a 108px tile a 112px caption then washes the WHOLE
         *  picture: C:/dev/EVIDENCE/TILE-CAPTION/cities-390-anchored-only.png is
         *  what that looks like, and it trades a contrast defect for an
         *  image-poor one. The design system had already answered it: "Image
         *  alone, all details below the image ... the single allowed on-photo
         *  overlay is a place name on a darkened-gradient band on city/venue
         *  tiles, one line of identity only." The state and the count are now
         *  below the image, where they are read on canvas rather than on a sky. */}
        <TileCaption className="px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-3">
          {/* 18px at base is the design system's card-title size, and it is what
            *  MAKES the name one line: "Sunshine Coast", the longest of the 20,
            *  measures 156px at 20px against 147px of tile, so it wrapped, and a
            *  two-line caption took 88 per cent of a 107px tile. At 18px it is
            *  140px. Measured, not estimated:
            *  C:/dev/EVIDENCE/TILE-CAPTION/fit3.txt. */}
          <p className="font-display text-lg font-extrabold leading-tight text-white sm:text-xl lg:text-2xl">
            {entry.name}
          </p>
        </TileCaption>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <p className="text-xs font-medium text-ink-600 sm:text-sm">{entry.state}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          {countLabel}
        </p>
      </div>
    </Link>
  )
}
