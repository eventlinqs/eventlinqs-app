import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { HERO_HEADER_SCRIM } from '@/components/media/hero-photo-scrim'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { getSpineCategoryHero } from '@/lib/images/spine'

/**
 * PhotographicCategoryHero - Batch 4 replacement for the navy-950 + radial
 * gold "premium" PageHero on /categories/[slug].
 *
 * Pattern (per DESIGN-SYSTEM.md 6.2.1 - allowed image-band overlay):
 *   - photographic community hero raster behind the headline
 *   - darkened linear gradient bottom-up (10,22,40 navy) so the heading
 *     stays AA-readable without painting the whole hero black
 *   - place-name eyebrow + bold display headline + supporting body in
 *     left-anchored column, no body copy floats over the brightest part
 *     of the photo
 *   - light surface starts immediately after the hero band so the rest
 *     of the page reads as a Ticketmaster-style content surface, not a
 *     dark marketing wall
 */

const HERO_RASTER_BY_SLUG: Record<string, string> = {
  afrobeats: '/images/hero/afrobeats.jpg',
  amapiano: '/images/hero/amapiano.jpg',
  bollywood: '/images/hero/bollywood.jpg',
  caribbean: '/images/hero/caribbean-carnival.jpg',
  comedy: '/images/hero/comedy.jpg',
  filipino: '/images/hero/filipino.jpg',
  gospel: '/images/hero/gospel.jpg',
  latin: '/images/hero/latin.jpg',
  lunar: '/images/hero/lunar.jpg',
  owambe: '/images/hero/owambe.jpg',
}

/**
 * THE LAST RESORT, AND WHY IT IS NOT A COMMUNITY PHOTOGRAPH ANY MORE.
 *
 * This used to be the Afrobeats raster, and the note on `fallbackImage` below
 * already argued against it in terms: a category landing opening on "a
 * photograph of a community dance floor ... is a worse failure than a missing
 * image because it is confidently wrong".
 *
 * It was UNREACHABLE while it was wrong, which is the only reason that argument
 * was never tested: the page always passed a non-empty `fallbackImage`, so the
 * `??` chain stopped one step early. Fixing that (the page now passes null when
 * it has no photograph) made this the value that actually renders on
 * /categories/technology, so it had to become true as well as reachable.
 *
 * It is a daytime festival crowd from the licensed platform library, already
 * bundled and already used on the homepage: category-neutral, so it is never
 * confidently wrong, and a RASTER, so the hero can be the LCP. Nothing here is
 * invented; the asset and the slot both already existed.
 */
const HERO_RASTER_DEFAULT = '/images/hero/homepage-day-festival.jpg'

interface Props {
  slug: string
  eyebrow: string
  title: string
  subtitle: string
  /**
   * A photo already resolved by the page, used ONLY when neither the licensed
   * spine nor a bundled raster covers this slug.
   *
   * WHY IT EXISTS (close-out SEO3 step 4). The chain below used to end at
   * `HERO_RASTER_DEFAULT`, which was then the Afrobeats raster. That was correct
   * while this route served seven hero slugs, six of them African community
   * landings. It stopped being correct the moment the route began serving the 22
   * real categories: `/categories/technology` would have opened on a photograph
   * of a community dance floor, which is a worse failure than a missing image
   * because it is confidently wrong. The page resolves a category photo and
   * hands it in here.
   *
   * IT MUST BE A PHOTOGRAPH OR NULL, NEVER A PLACEHOLDER (19 September 2026).
   * The page used to pass `photo.src` unconditionally, and that is the branded
   * SVG when the resolver has no photograph. A non-empty string wins the `??`,
   * so the default below never ran and `HeroMedia` was handed an SVG: 500 in
   * development, and a hero that cannot be the LCP in production. The page now
   * asks `isBrandedFallbackPhoto` and passes null instead, which is also why the
   * default finally had to become category-neutral.
   */
  fallbackImage?: string | null
  /**
   * What the fallback photograph SHOWS, used only when `fallbackImage` is the
   * one that wins.
   *
   * WHY IT IS OPTIONAL AND WHY IT EXISTS (close-out AQ3, 19 September 2026).
   * The alt below is built from the page TITLE, which describes the page rather
   * than the picture. That is the champion behaviour on twenty-two category
   * landings and is not changed here. `/this-weekend` resolves its hero from
   * `src/lib/images/weekend-photos.ts`, which already holds the sentence that
   * says what is in the frame, and throwing that away to re-derive a worse one
   * would be the template winning an argument with the data.
   */
  fallbackAlt?: string
  /** The focal point that goes with `fallbackImage`. Same rule as the alt. */
  fallbackObjectPosition?: string
}

export function PhotographicCategoryHero({
  slug,
  eyebrow,
  title,
  subtitle,
  fallbackImage = null,
  fallbackAlt,
  fallbackObjectPosition,
}: Props) {
  // Spine-first: the licensed category hero. Falls back to the bundled community
  // raster (old slugs), then to the photo the page resolved, then the default.
  const spine = getSpineCategoryHero(slug)
  const src = spine?.src ?? HERO_RASTER_BY_SLUG[slug] ?? fallbackImage ?? HERO_RASTER_DEFAULT
  const usingFallback = !spine && !HERO_RASTER_BY_SLUG[slug] && Boolean(fallbackImage)
  const objectPosition =
    spine?.objectPosition ?? (usingFallback ? fallbackObjectPosition ?? '50% 30%' : '50% 30%')
  const alt = usingFallback && fallbackAlt ? fallbackAlt : `${title} on EventLinqs`

  return (
    <section
      aria-labelledby="category-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      <div className="hero-marketing relative w-full">
        <HeroMedia image={src} alt={alt} objectPosition={objectPosition} priority />
        {/* The header wash only. The text carries its own, anchored to itself. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: HERO_HEADER_SCRIM }}
        />
        {/* Left-anchored content column - no body copy on the brightest band */}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8 lg:pb-20">
          <HeroCaption className="max-w-2xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
              {eyebrow}
            </p>
            <h1
              id="category-hero-heading"
              className="mt-3 font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {subtitle}
            </p>
          </HeroCaption>
        </div>
      </div>
    </section>
  )
}
