import { HeroMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'

/**
 * PhotographicCityHero - Batch 4 hero band for /events/browse/[city].
 *
 * Pattern (per DESIGN-SYSTEM.md 6.2.1 - allowed image-band overlay):
 *   - landscape Pexels city photo behind the headline
 *   - darkened linear gradient bottom-up (10,22,40 navy) so the city
 *     name + subtitle stay AA-readable without painting the entire
 *     band black
 *   - left-anchored content column with the event count chip so the
 *     page still reads as a discovery surface, not a marketing page
 *   - light surface picks up immediately below in the next section
 *
 * If no Pexels image is available (no PEXELS_API_KEY in dev or API
 * miss for an obscure city slug), we fall back to a navy-gradient
 * band - never a placeholder image, never a broken raster.
 */

interface Props {
  city: string
  country: string
  total: number
  imageSrc: string | null
  /** Focal point for the cover crop (spine slot imagery). Defaults centre. */
  objectPosition?: string
}

export function PhotographicCityHero({ city, country, total, imageSrc, objectPosition = '50% 50%' }: Props) {
  const alt = `${city} on EventLinqs`
  const totalLabel = `${total} event${total === 1 ? '' : 's'} available`

  return (
    <section
      aria-labelledby="city-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      {/* Single platform hero scale (.hero-marketing). Flattened from the old
       *  h-[44vh] band so /events/browse/[city] matches /city/[slug] and the
       *  homepage exactly - one hero scale, one source. */}
      <div className="hero-marketing relative w-full">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={alt} objectPosition={objectPosition} priority />
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
        {/* Top scrim (0% to 12%) plus the original bottom-up ramp.
         *  Top scrim ensures the sticky header's white nav remains
         *  AA-readable when the photograph has a bright sky band.
         *  Fix from Batch 11.0 founder review. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.20) 12%, rgba(10,22,40,0.65) 45%, rgba(10,22,40,0.92) 100%)',
          }}
        />
        {/* Left-anchored content column */}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8 lg:pb-12">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
              {country}
            </p>
            <h1
              id="city-hero-heading"
              className="mt-2 font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              Events in {city}
            </h1>
            <p className="mt-3 text-sm font-medium text-white/85 sm:text-base">
              {totalLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
