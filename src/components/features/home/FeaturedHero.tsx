import Link from 'next/link'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { getFeaturedHeroBackground } from '@/lib/images/event-media'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { FeaturedHeroClient, type FeaturedHeroSlide } from './FeaturedHeroClient'

/**
 * FeaturedHero - the homepage hero. ONE strong, real featured event at a
 * time (Ticketmaster / Humanitix style), roughly half the height of the old
 * full-bleed carousel. When several featured events exist (up to five) the
 * hero auto-rotates every ~6.5s with an eased crossfade (Hero Carousel law,
 * CLAUDE.md Motion - pauses on hover/touch/focus, motion-flag gated, no
 * rotation under reduced motion), and the visitor can step between slides
 * with arrows and dots at any time.
 *
 * Data is real: it takes the page's already-fetched upcoming events and
 * features the soonest few that carry a usable cover. Media resolves on the
 * server (real cover, else a real category stock photo) and the first slide
 * paints a priority AVIF raster as the LCP layer via HeroMedia - SSR, no
 * client-only mount, no opacity fade.
 *
 * The homepage keeps exactly one h1 here for a11y/SEO; the featured event
 * titles below it are h2s rendered by the client controller.
 */

const MAX_SLIDES = 5

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function detailLine(event: BentoEvent): string {
  const parts = [event.venue_name, event.venue_city, formatDate(event.start_date)]
    .map(p => (p ?? '').toString().trim())
    .filter(Boolean)
  return parts.join('  |  ')
}

async function toSlide(event: BentoEvent): Promise<FeaturedHeroSlide> {
  // getFeaturedHeroBackground guarantees a raster image (real event cover when
  // present, else a bundled category hero raster) - never an SVG. This is the
  // same raster-safe resolver the event-detail hero uses, so every featured
  // slide always paints a valid LCP-eligible photo, even for events that have
  // no uploaded cover yet.
  const media = await getFeaturedHeroBackground(event)

  return {
    id: event.id,
    kicker: event.category?.name ?? 'Featured event',
    title: event.title ?? 'Featured event',
    detailLine: detailLine(event),
    href: `/events/${event.slug}`,
    image: media.image,
    alt: media.alt,
  }
}

export async function FeaturedHero({ events }: { events: BentoEvent[] }) {
  const featured = events.slice(0, MAX_SLIDES)

  // Empty state: no live events yet. Render a calm, branded banner so the
  // top of the page never collapses - still the only place text sits on a
  // surface, here a flat navy panel rather than a photo.
  if (featured.length === 0) {
    return (
      <section
        aria-labelledby="home-hero-heading"
        className="relative w-full overflow-hidden bg-[var(--color-navy-950)]"
      >
        <HeroPresenceMarker />
        <h1 id="home-hero-heading" className="sr-only">
          Live events across Australia: music, scenes, festivals and community
        </h1>
        <div className="hero-marketing mx-auto flex max-w-7xl items-end px-6 pb-10 sm:px-8 lg:px-12">
          <div className="max-w-2xl hero-enter">
            <p
              className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
              style={{ fontWeight: 600 }}
            >
              EventLinqs
            </p>
            <p className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Every community. Every event. One platform.
            </p>
            <p className="mt-2 text-sm text-white/85 sm:text-base">
              The first organisers are getting set up. New events land here every week.
            </p>
            <div className="mt-5">
              <Link
                href="/events"
                prefetch={false}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-accent)] px-7 text-[var(--color-navy-950)] shadow-lg shadow-black/30 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(212,164,55,0.32)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                style={{ fontSize: 'var(--type-body)', fontWeight: 600, transition: 'transform var(--motion-quick), box-shadow var(--motion-quick)' }}
              >
                Browse all events
              </Link>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const slides = await Promise.all(featured.map(toSlide))

  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative w-full overflow-hidden bg-[var(--color-navy-950)]"
    >
      <HeroPresenceMarker />
      <h1 id="home-hero-heading" className="sr-only">
        Live events across Australia: music, scenes, festivals and community
      </h1>
      <FeaturedHeroClient slides={slides} />
    </section>
  )
}
