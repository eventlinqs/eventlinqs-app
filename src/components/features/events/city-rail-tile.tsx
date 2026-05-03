import Link from 'next/link'
import { CityTileImage } from '@/components/media'

/**
 * CityRailTile: 220-280px snap-start city tile for the By City rail.
 *
 * Separated-card pattern (rebuilt batch 3):
 *   - Image at TOP with city name on darkened-gradient label band along
 *     the lower edge of the image (the one acceptable overlay pattern).
 *   - White card body BELOW the image with event-count meta.
 *   - 8px radius, hover lift + shadow.
 *
 * Image rendering is delegated to the CityTileImage media surface, which
 * routes local SVGs through a raw <img> (avoiding the optimizer re-encoding
 * vector cities into rasters) and remote rasters through next/image with
 * the rail sizes/quality presets.
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
      href={`/events/browse/${encodeURIComponent(slug)}`}
      className="group flex w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 sm:w-[260px]"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--surface-1)]">
        <CityTileImage
          src={imageSrc}
          alt=""
          className="transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.85) 100%)',
          }}
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
          <h3 className="font-display text-xl font-extrabold leading-tight text-white">
            {city}
          </h3>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        {typeof eventCount === 'number' && eventCount > 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            {eventCount} upcoming {eventCount === 1 ? 'event' : 'events'}
          </p>
        ) : (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
            Coming soon
          </p>
        )}
        <span
          className="text-[var(--text-muted)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent-strong)]"
          aria-hidden
        >
          &rarr;
        </span>
      </div>
    </Link>
  )
}
