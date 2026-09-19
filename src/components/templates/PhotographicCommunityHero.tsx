import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { HERO_HEADER_SCRIM, HERO_NO_PHOTO_FIELD } from '@/components/media/hero-photo-scrim'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'

/**
 * PhotographicCommunityHero - Batch 5 hero band for /community/[slug].
 *
 * Mirrors PhotographicCityHero: landscape Pexels community photo behind
 * a left-anchored headline, darkened bottom-up gradient so the text
 * stays AA-readable, light primary surface picks up immediately below.
 *
 * Falls back to a navy-gradient band when no Pexels image is available.
 */

interface Props {
  eyebrow: string
  title: string
  subtitle: string
  imageSrc: string | null
  /** Focal point for the cover crop (spine slot imagery). Defaults centre. */
  objectPosition?: string
}

export function PhotographicCommunityHero({ eyebrow, title, subtitle, imageSrc, objectPosition = '50% 30%' }: Props) {
  return (
    <section
      aria-labelledby="community-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      <div className="hero-marketing relative w-full">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={`${title} on EventLinqs`} objectPosition={objectPosition} priority />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: HERO_NO_PHOTO_FIELD }}
          />
        )}
        {/* The header wash, which keeps the sticky header's white nav readable
         *  when the photograph carries a bright sky band (Fix from Batch 11.0
         *  founder review: header-bleed on bright /community and /city heroes).
         *  The text below carries its own wash, anchored to itself rather than
         *  to this band, which is what makes its contrast a guarantee. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: HERO_HEADER_SCRIM }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <HeroCaption className="max-w-3xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
              {eyebrow}
            </p>
            <h1
              id="community-hero-heading"
              className="mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-base">
              {subtitle}
            </p>
          </HeroCaption>
        </div>
      </div>
    </section>
  )
}
