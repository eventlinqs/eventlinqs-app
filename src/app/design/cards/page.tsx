import type { Metadata } from 'next'
import {
  EventCardFeature,
  EventCardLandscape,
  EventCardSquare,
  CityTile,
  CardSkeleton,
  CardEmptyState,
  type HomeCardEvent,
  type CityTileData,
} from '@/components/features/home/cards'

// Temporary design-review route. Noindex so it never surfaces publicly.
export const metadata: Metadata = {
  title: 'Card system | EventLinqs',
  robots: { index: false, follow: false },
}

// Reliable real photography for the preview via picsum (allow-listed host,
// no path restriction). Real organiser and Adobe Stock imagery drops in
// later through the same EventCardMedia contract - only the src changes.
const img = (seed: string, w = 1000, h = 750) => `https://picsum.photos/seed/${seed}/${w}/${h}`

const FEATURE: HomeCardEvent = {
  href: '/events/sampa-the-great-melbourne-2026',
  imageSrc: img('eventlinqs-sampa', 1280, 720),
  alt: 'A live music crowd at an outdoor amphitheatre at dusk',
  label: 'Hip-hop',
  title: 'Sampa the Great: Eternal Tour',
  venue: 'Sidney Myer Music Bowl',
  city: 'Melbourne',
  dateLabel: 'Sat 14 Mar 2026',
  priceLabel: 'From AUD $79',
  priority: true,
}

const FEATURE_BLURB =
  'The Zambian-Australian artist returns home for one night, full live band, with support from the Melbourne scene.'

const LANDSCAPE: HomeCardEvent[] = [
  {
    href: '/events/afrobeats-festival-sydney-2026',
    imageSrc: img('eventlinqs-afrobeats', 1000, 625),
    alt: 'Dancers in bright dress at an outdoor festival',
    label: 'Afrobeats',
    title: 'Afrobeats Festival Sydney',
    venue: 'Tumbalong Park',
    city: 'Sydney',
    dateLabel: 'Sun 22 Feb 2026',
    priceLabel: 'From AUD $55',
  },
  {
    href: '/events/amapiano-all-night-melbourne-2026',
    imageSrc: img('eventlinqs-amapiano', 1000, 625),
    alt: 'A packed club with stage lighting',
    label: 'Amapiano',
    title: 'Amapiano All Night',
    venue: 'Northcote Theatre',
    city: 'Melbourne',
    dateLabel: 'Fri 6 Mar 2026',
    priceLabel: 'From AUD $40',
  },
  {
    href: '/events/lunar-new-year-lantern-festival-sydney-2026',
    imageSrc: img('eventlinqs-lunar', 1000, 625),
    alt: 'Red lanterns strung above a night market',
    label: 'Festival',
    title: 'Lunar New Year Lantern Festival',
    venue: 'Tumbalong Park',
    city: 'Sydney',
    dateLabel: 'Fri 13 Feb 2026',
    priceLabel: 'Free',
  },
  {
    href: '/events/melbourne-comedy-gala-2026',
    imageSrc: img('eventlinqs-comedy', 1000, 625),
    alt: 'A comedian on a spotlit stage',
    label: 'Comedy',
    title: 'Melbourne International Comedy Gala',
    venue: 'Comedy Theatre',
    city: 'Melbourne',
    dateLabel: 'Thu 19 Mar 2026',
    priceLabel: 'From AUD $45',
  },
]

const SQUARE: HomeCardEvent[] = [
  {
    href: '/events/night-noodle-markets-sydney-2026',
    imageSrc: img('eventlinqs-noodle', 700, 700),
    alt: 'Street food stalls lit at night',
    label: 'Food',
    title: 'Night Noodle Markets',
    venue: 'Hyde Park',
    city: 'Sydney',
    dateLabel: 'Wed 7 Oct 2026',
    priceLabel: 'Free',
  },
  {
    href: '/events/gospel-sunday-live-brisbane-2026',
    imageSrc: img('eventlinqs-gospel', 700, 700),
    alt: 'A gospel choir performing',
    label: 'Gospel',
    title: 'Gospel Sunday Live',
    venue: 'Festival Hall',
    city: 'Brisbane',
    dateLabel: 'Sun 1 Mar 2026',
    priceLabel: 'From AUD $30',
  },
  {
    href: '/events/bollywood-nights-brisbane-2026',
    imageSrc: img('eventlinqs-bollywood', 700, 700),
    alt: 'A vibrant stage performance with colour',
    label: 'Bollywood',
    title: 'Bollywood Nights',
    venue: 'Riverstage',
    city: 'Brisbane',
    dateLabel: 'Sat 28 Mar 2026',
    priceLabel: 'From AUD $50',
  },
  {
    href: '/events/pasifika-festival-melbourne-2026',
    imageSrc: img('eventlinqs-pasifika', 700, 700),
    alt: 'Pacific Islander performers at a festival',
    label: 'Pacific',
    title: 'Pasifika Festival',
    venue: 'Federation Square',
    city: 'Melbourne',
    dateLabel: 'Sun 15 Feb 2026',
    priceLabel: 'Free',
  },
  {
    href: '/events/latin-street-carnival-canberra-2026',
    imageSrc: img('eventlinqs-latin', 700, 700),
    alt: 'A street carnival with dancers',
    label: 'Latin',
    title: 'Latin Street Carnival',
    venue: 'Garema Place',
    city: 'Canberra',
    dateLabel: 'Sat 7 Mar 2026',
    priceLabel: 'Free',
  },
  {
    href: '/events/highlife-reunion-brisbane-2026',
    imageSrc: img('eventlinqs-highlife', 700, 700),
    alt: 'A band performing on stage',
    label: 'Highlife',
    title: 'Highlife Reunion',
    venue: 'The Tivoli',
    city: 'Brisbane',
    dateLabel: 'Fri 24 Apr 2026',
    priceLabel: 'From AUD $60',
  },
]

const CITIES: CityTileData[] = [
  { href: '/city/sydney', imageSrc: img('eventlinqs-sydney', 900, 600), alt: 'Sydney skyline', name: 'Sydney', metaLabel: '32 events', priority: true },
  { href: '/city/melbourne', imageSrc: img('eventlinqs-melbourne', 900, 600), alt: 'Melbourne laneway', name: 'Melbourne', metaLabel: '41 events' },
  { href: '/city/brisbane', imageSrc: img('eventlinqs-brisbane', 900, 600), alt: 'Brisbane river', name: 'Brisbane', metaLabel: '18 events' },
  { href: '/city/perth', imageSrc: img('eventlinqs-perth', 900, 600), alt: 'Perth skyline', name: 'Perth', metaLabel: '12 events' },
  { href: '/city/adelaide', imageSrc: img('eventlinqs-adelaide', 900, 600), alt: 'Adelaide parklands', name: 'Adelaide', metaLabel: '9 events' },
  { href: '/city/gold-coast', imageSrc: img('eventlinqs-goldcoast', 900, 600), alt: 'Gold Coast beach', name: 'Gold Coast', metaLabel: '7 events' },
]

function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-1 h-7 w-0.5 shrink-0 bg-[var(--brand-accent)]" aria-hidden />
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
          {eyebrow}
        </p>
        <h2 className="font-headline text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
      </div>
    </div>
  )
}

export default function DesignCardsPage() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 max-w-2xl">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
            EventLinqs design
          </p>
          <h1 className="mt-2 font-headline text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Home card system
          </h1>
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            The image stands alone. The label, title and meta sit below it. One link, quiet finish, navy and gold. Sample data and placeholder photography.
          </p>
        </header>

        <section className="mb-14" aria-labelledby="feature-h">
          <SectionLabel eyebrow="Lead item" title="Wide feature card" />
          <div className="max-w-3xl">
            <EventCardFeature event={FEATURE} blurb={FEATURE_BLURB} />
          </div>
        </section>

        <section className="mb-14" aria-labelledby="landscape-h">
          <SectionLabel eyebrow="Default rail card" title="Standard landscape" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LANDSCAPE.map(e => (
              <EventCardLandscape key={e.href} event={e} />
            ))}
          </div>
        </section>

        <section className="mb-14" aria-labelledby="square-h">
          <SectionLabel eyebrow="Genre and trending rails" title="Compact square tile" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {SQUARE.map(e => (
              <EventCardSquare key={e.href} event={e} />
            ))}
          </div>
        </section>

        <section className="mb-14" aria-labelledby="city-h">
          <SectionLabel eyebrow="By city" title="City tile" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {CITIES.map(c => (
              <CityTile key={c.href} city={c} />
            ))}
          </div>
        </section>

        <section className="mb-14" aria-labelledby="loading-h">
          <SectionLabel eyebrow="Production states" title="Loading" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </section>

        <section aria-labelledby="empty-h">
          <SectionLabel eyebrow="Production states" title="Empty" />
          <div className="max-w-md">
            <CardEmptyState />
          </div>
        </section>
      </div>
    </main>
  )
}
