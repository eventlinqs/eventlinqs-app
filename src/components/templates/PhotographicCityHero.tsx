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
}

export function PhotographicCityHero({ city, country, total, imageSrc }: Props) {
  const alt = `${city} on EventLinqs`
  const totalLabel = `${total} event${total === 1 ? '' : 's'} available`

  return (
    <section
      aria-labelledby="city-hero-heading"
      className="relative overflow-hidden"
    >
      <HeroPresenceMarker />
      <div className="relative h-[44vh] min-h-[280px] max-h-[420px] w-full">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={alt} priority />
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
        {/* Darkened gradient: bottom-up navy so headline stays readable */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.10) 0%, rgba(10,22,40,0.65) 45%, rgba(10,22,40,0.92) 100%)',
          }}
        />
        {/* Left-anchored content column */}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8 lg:pb-12">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-white/85">
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
