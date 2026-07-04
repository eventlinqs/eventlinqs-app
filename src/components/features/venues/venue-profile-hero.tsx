import Link from 'next/link'
import { HeroMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { MapPin, Users } from 'lucide-react'

interface Props {
  venueName: string
  city: string | null
  neighbourhood?: string | null
  imageSrc: string | null
  capacity: number | null
  venueType: string | null
  /** Anchor on the page that the primary CTA should jump to. */
  upcomingAnchorId?: string
  /** Optional Google Maps directions URL (built from address or lat/lng). */
  directionsUrl?: string | null
}

/**
 * VenueProfileHero - full-bleed photographic banner for /venues/[handle]
 * (Batch 8.3 VP1). Mirrors the city + community hero pattern (image +
 * dark gradient + bottom-left content stack) with venue-specific
 * pills (capacity + venue type) and two CTAs.
 */
export function VenueProfileHero({
  venueName,
  city,
  neighbourhood,
  imageSrc,
  capacity,
  venueType,
  upcomingAnchorId = 'upcoming-events',
  directionsUrl,
}: Props) {
  const subtitle = neighbourhood && city
    ? `${neighbourhood}, ${city}`
    : city ?? null

  const pills: string[] = []
  if (capacity) pills.push(`Capacity ${capacity.toLocaleString('en-AU')}`)
  if (venueType) pills.push(venueType)

  return (
    <section aria-labelledby="venue-hero-heading" className="relative overflow-hidden">
      <HeroPresenceMarker />
      <div className="relative h-[64vh] min-h-[440px] max-h-[560px] w-full sm:h-[55vh] sm:min-h-[400px] sm:max-h-[600px]">
        {imageSrc ? (
          <HeroMedia image={imageSrc} alt={`${venueName}${city ? ` in ${city}` : ''}`} priority />
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0.18) 12%, rgba(10,22,40,0.45) 45%, rgba(10,22,40,0.88) 100%)',
          }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-5 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-white/85 sm:text-xs">
              Venue
            </p>
            <h1
              id="venue-hero-heading"
              className="mt-2 font-display text-[2.25rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              {venueName}
            </h1>
            {subtitle ? (
              <p className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium text-white/90 sm:text-base">
                <MapPin className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
                {subtitle}
              </p>
            ) : null}

            {pills.length > 0 ? (
              <ul role="list" className="mt-4 flex flex-wrap gap-2">
                {pills.map(p => (
                  <li
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
                  >
                    {p.startsWith('Capacity') ? <Users className="h-3.5 w-3.5" aria-hidden /> : null}
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={`#${upcomingAnchorId}`}
                className="inline-flex h-12 min-w-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] shadow-sm transition hover:bg-[var(--brand-accent-strong)] sm:h-11"
              >
                View upcoming events
              </a>
              {directionsUrl ? (
                <Link
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 min-w-[44px] items-center justify-center rounded-full border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:h-11"
                >
                  Get directions
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
