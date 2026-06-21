import { HeroMedia } from '@/components/media'
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

const HERO_RASTER_DEFAULT = '/images/hero/afrobeats.jpg'

interface Props {
  slug: string
  eyebrow: string
  title: string
  subtitle: string
}

export function PhotographicCategoryHero({ slug, eyebrow, title, subtitle }: Props) {
  // Spine-first: the licensed category hero. Falls back to the bundled community
  // raster (old slugs) then the default for anything without a spine slot.
  const spine = getSpineCategoryHero(slug)
  const src = spine?.src ?? HERO_RASTER_BY_SLUG[slug] ?? HERO_RASTER_DEFAULT
  const objectPosition = spine?.objectPosition ?? '50% 50%'
  const alt = `${title} on EventLinqs`

  return (
    <section
      aria-labelledby="category-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      <div className="hero-marketing relative w-full">
        <HeroMedia image={src} alt={alt} objectPosition={objectPosition} priority />
        {/* Darkened gradient: bottom-up navy so headline stays readable */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.18) 12%, rgba(10,22,40,0.35) 45%, rgba(10,22,40,0.85) 100%)',
          }}
        />
        {/* Left-anchored content column - no body copy on the brightest band */}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8 lg:pb-20">
          <div className="max-w-2xl">
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
          </div>
        </div>
      </div>
    </section>
  )
}
