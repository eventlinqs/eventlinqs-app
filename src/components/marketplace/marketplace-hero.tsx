import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { HERO_NO_PHOTO_FIELD } from '@/components/media/hero-photo-scrim'

/**
 * Shared compact hero band for the marketplace surfaces (/gigs, /artists):
 * real photography with the platform bottom-up navy scrim, gold eyebrow, and
 * restrained display type, mirroring the discovery-surface hero language.
 * Never a bare band: photo resolves through the licensed spine with the
 * navy gradient as the no-photo fallback.
 */
export async function MarketplaceHero({
  eyebrow,
  title,
  subtitle,
  citySlug = 'melbourne',
}: {
  eyebrow: string
  title: string
  subtitle: string
  citySlug?: string
}) {
  const photo = await getCityHeroPhoto(citySlug)

  return (
    <section className="relative overflow-hidden" aria-labelledby="marketplace-hero-heading">
      <div className="relative min-h-[280px] w-full sm:min-h-[320px]">
        {/*
         * THE PHOTOGRAPH GOES THROUGH THE MEDIA COMPONENT, 20 September 2026.
         * It was painted as a CSS `background-image`, which docs/MEDIA-ARCHITECTURE.md
         * forbids for content and which costs exactly what that law exists to
         * protect: no AVIF or WebP negotiation, no responsive `sizes`, no
         * priority handling, on a band that owns the LCP of both routes it
         * renders on. It also meant this file rendered no media component at
         * all, so every derivation that looks for one walked straight past it.
         */}
        {photo ? (
          <HeroMedia image={photo} alt="" priority />
        ) : (
          <div className="absolute inset-0" style={{ background: HERO_NO_PHOTO_FIELD }} aria-hidden />
        )}
        {/*
         * AND THE TEXT RIDES THE SHARED WASH. The band used to carry its own
         * `rgba(10,22,40,0.45) 0%, 0.60 55%, 0.92 100%`: a percentage of a band
         * whose caption is bottom-anchored and hugs its own content, which is
         * the defect `hero-photo-scrim.ts` was written to end. NOT DRIVEN, and
         * said plainly rather than implied: /artists and /gigs are gated on the
         * `artist_showcase` and `gig_board` flags, both `false` in
         * BROADCAST_FLAG_DEFAULTS, so both routes answer 404 and no URL on this
         * platform renders this band today. What holds it is the arithmetic the
         * wash carries, re-computed by hero-text-over-a-photograph.mjs clause 2
         * on every build, rather than one photograph's measurement.
         */}
        <HeroCaption
          className="z-10 mx-auto flex min-h-[280px] w-full max-w-7xl flex-col justify-end px-4 pb-8 pt-24 sm:min-h-[320px] sm:px-6 lg:px-8"
          contentClassName="flex flex-col"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            {eyebrow}
          </p>
          <h1
            id="marketplace-hero-heading"
            className="mt-2 max-w-3xl font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-4xl"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-base">
            {subtitle}
          </p>
        </HeroCaption>
      </div>
    </section>
  )
}
