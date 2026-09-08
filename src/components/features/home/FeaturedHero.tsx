import Link from 'next/link'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { HeroMedia } from '@/components/media'
import { pickCuratedHomepageHero } from '@/lib/images/homepage-hero-curated'
import { HERO_SCRIM_GRADIENT } from './hero-scrim'
import { getFeaturedHeroBackground } from '@/lib/images/event-media'
import { GENERATED_COVER_PREFIX } from '@/lib/events/generated-cover-prefix'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'
import { FeaturedHeroClient, type FeaturedHeroSlide } from './FeaturedHeroClient'
import { BRAND_TAGLINE_PHRASE_BOUND } from '@/lib/brand/positioning'

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

/**
 * A composed typographic cover (Law 6's no-photo fallback) carries the event's
 * own title as its artwork. Behind the hero headline that is the same title
 * twice, at display size, one on top of the other: measured on the C14
 * before-capture, where every slide on a launch-stage homepage was one. The
 * hero paints the category raster for those and the composed cover stays
 * where it was designed for, on the card.
 */
function isComposedCover(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes(`/${GENERATED_COVER_PREFIX}/`)
}

async function toSlide(event: BentoEvent): Promise<FeaturedHeroSlide> {
  // getFeaturedHeroBackground guarantees a raster image (real event cover when
  // present, else a bundled category hero raster) - never an SVG. This is the
  // same raster-safe resolver the event-detail hero uses, so every featured
  // slide always paints a valid LCP-eligible photo, even for events that have
  // no uploaded cover yet.
  const source = isComposedCover(event.cover_image_url) ? { ...event, cover_image_url: null } : event
  const media = await getFeaturedHeroBackground(source)

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
  // Photographic covers lead the carousel; events on a composed cover or no
  // cover follow in their own order, so a real photo is the first paint
  // whenever the catalogue has one. Stable sort: soonest-first within a group.
  const photographic = (e: BentoEvent) => Boolean(e.cover_image_url) && !isComposedCover(e.cover_image_url)
  const featured = [...events].sort((a, b) => Number(photographic(b)) - Number(photographic(a))).slice(0, MAX_SLIDES)

  // NO FEATURED EVENT: THE HERO STILL WEARS A PHOTOGRAPH (close-out C17.2,
  // 7 September 2026). This branch used to render a flat navy banner, and on
  // 6 September production held only events that had ended, so the first thing
  // the owner's reviewer would have seen was a dark rectangle. Now it wears one
  // of the founder's licensed homepage rasters (public/images/hero, the licence
  // recorded beside the assets), chosen by the day so a render never flickers
  // and the set turns over, under the same hero frame, scrim, eyebrow, display
  // scale and gold call to action as a featured slide. HeroMedia owns the one
  // remaining failure: a raster that does not load paints the branded navy and
  // gold treatment. scripts/guards/homepage-hero-never-empty.mjs fails the
  // build if this branch stops rendering HeroMedia from the curated set.
  if (featured.length === 0) {
    const curated = pickCuratedHomepageHero()
    return (
      <section
        aria-labelledby="home-hero-heading"
        className="relative w-full overflow-hidden bg-[var(--color-navy-950)]"
      >
        <HeroPresenceMarker />
        <h1 id="home-hero-heading" className="sr-only">
          Live events across Australia: music, scenes, festivals and community
        </h1>
        {/* The single platform hero token (.hero-marketing, founder ruling
            2026-07-07) sizes the box; HeroMedia fills it with the raster that
            is the LCP of a homepage with no featured event. */}
        <div className="relative hero-marketing w-full">
          <HeroMedia image={curated.image} alt={curated.alt} priority />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: HERO_SCRIM_GRADIENT }} />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
            <div className="max-w-2xl hero-enter">
              <p
                className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                style={{ fontWeight: 600 }}
              >
                EventLinqs
              </p>
              {/* Each phrase is bound with a non-breaking space so the headline wraps
                  phrase by phrase and never leaves one word alone on a line
                  (C17.4: measured orphaning "platform." at 390 and 768). */}
              <p className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {BRAND_TAGLINE_PHRASE_BOUND}
              </p>
              <p className="mt-2 text-sm text-white/85 sm:text-base">
                The first organisers are getting set up. New events land here every week.
              </p>
              <div className="mt-5">
                <Link
                  href="/events"
                  prefetch={false}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--brand-accent)] px-7 text-[var(--color-navy-950)] shadow-[var(--shadow-card)] hover:scale-[1.02] hover:shadow-[var(--shadow-card-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                  style={{ fontSize: 'var(--type-body)', fontWeight: 600, transition: 'transform var(--motion-quick), box-shadow var(--motion-quick)' }}
                >
                  Browse all events
                </Link>
              </div>
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
