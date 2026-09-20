import Link from 'next/link'
import { CityTileImage } from '@/components/media/CityTileImage'
import { TileCaption } from '@/components/media/tile-caption'
/**
 * CityTile: editorial city bento tile backed by a local SVG placeholder.
 *
 * Swap placeholder paths for real photography in M5 without changing the
 * component surface.
 *
 * Image rendering is delegated to the CityTileImage media surface, which
 * routes local SVGs through a raw <img> (avoiding Next.js raster
 * re-encoding of vector cities) and remote rasters through next/image
 * with the rail sizes/quality presets.
 */

interface Props {
  city: string
  slug: string
  eventCount?: number
  imageSrc: string
}

export function CityTile({ city, slug, eventCount, imageSrc }: Props) {
  return (
    <Link
      href={`/events?city=${encodeURIComponent(slug)}`}
      className="group relative block h-full min-h-[220px] overflow-hidden rounded-2xl bg-ink-900 tile-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
    >
      <CityTileImage
        layout="grid-one-two-three"
        src={imageSrc}
        alt=""
        className="transition-transform duration-700 ease-out group-hover:scale-105"
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-transparent transition-colors duration-300 group-hover:border-gold-400/60"
        aria-hidden
      />

      {/* The wash here was `0 at 0%, 0.2 at 55%, 0.8 at 100%` of the TILE, and
       *  the label is bottom-anchored and hugs its own content, so where it
       *  landed on that ramp moved with the tile's height. <TileCaption>
       *  anchors the wash to the label; see
       *  src/components/media/tile-photo-scrim.ts. */}
      <TileCaption className="p-5 text-white">
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
            className="opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 translate-x-[-6px] text-[var(--brand-accent)]"
            aria-hidden
          >
            &rarr;
          </span>
        </div>
      </TileCaption>
    </Link>
  )
}
