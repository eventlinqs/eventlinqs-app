import { HeroMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'

/**
 * PhotographicCultureHero - Batch 5 hero band for /culture/[slug].
 *
 * Mirrors PhotographicCityHero: landscape Pexels culture photo behind
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
}

export function PhotographicCultureHero({ eyebrow, title, subtitle, imageSrc }: Props) {
  return (
    <section
      aria-labelledby="culture-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      <div className="relative h-[48vh] min-h-[320px] max-h-[460px] w-full">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={`${title} on EventLinqs`} priority />
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
        {/* Top scrim (0% to 12%) ensures the sticky header's white nav
         *  remains AA-readable when the underlying photograph contains
         *  a bright sky band. Beneath it the original bottom-up ramp
         *  continues, leaving the centre of the hero photo unobscured.
         *  Fix from Batch 11.0 founder review (header-bleed on bright
         *  /culture and /city heroes). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.20) 12%, rgba(10,22,40,0.65) 45%, rgba(10,22,40,0.92) 100%)',
          }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-white/85">
              {eyebrow}
            </p>
            <h1
              id="culture-hero-heading"
              className="mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-base">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
