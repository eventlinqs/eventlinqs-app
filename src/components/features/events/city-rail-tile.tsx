import Link from 'next/link'

/**
 * CityRailTile — 280px wide, 4:5 aspect-ratio city tile for the By City
 * horizontal rail. Distinct from the fuller-bleed CityTile used in grid layouts.
 */

interface Props {
  city: string
  slug: string
  eventCount?: number
  imageSrc: string
}

export function CityRailTile({ city, slug, eventCount, imageSrc }: Props) {
  return (
    <Link
      href={`/events?city=${encodeURIComponent(slug)}`}
      className="group relative block w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl bg-ink-900 tile-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
      aria-label={`Events in ${city}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.2) 55%, rgba(10,22,40,0.8) 100%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-transparent transition-colors duration-300 group-hover:border-gold-400/60"
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col justify-end p-5 text-white">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h3 className="font-display text-2xl font-extrabold leading-tight">{city}</h3>
              {typeof eventCount === 'number' && (
                <p className="mt-1 text-xs text-white/70">
                  {eventCount} upcoming {eventCount === 1 ? 'event' : 'events'}
                </p>
              )}
            </div>
            <span
              className="opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 translate-x-[-6px] text-gold-300"
              aria-hidden
            >
              &rarr;
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
