import type { ReactNode } from 'react'
import { TILE_CAPTION_FADE, TILE_CAPTION_SCRIM } from './tile-photo-scrim'

/**
 * TILE CAPTION. The label a tile paints on top of its photograph, sitting on
 * the one wash that is anchored to the label rather than to the tile.
 *
 * The measurement that forced it, why a percentage could never have held it and
 * where the alpha comes from are all in `./tile-photo-scrim.ts`. What matters at
 * a call site is only this: put the label inside this component and the platform
 * guarantees it clears its WCAG 2.2 SC 1.4.3 floor over any photograph, at any
 * viewport, for a label of any length. Do not paint another gradient around it.
 *
 * IT OWNS ITS OWN ANCHORING, WHICH THE HERO CAPTION DOES NOT. Every one of the
 * thirteen tile captions on the platform was written as
 * `absolute inset-x-0 bottom-0 p-4`, thirteen times, and three of them had
 * already drifted to `p-3`. The position is the component's; only the padding is
 * the caller's, so a tile cannot anchor its label anywhere a wash was not
 * computed for.
 *
 * THE WASH BLEEDS PAST ALL FOUR EDGES ON PURPOSE. A wash that stopped at the
 * label's own box would draw a visible seam across the picture. Every tile that
 * uses this carries `overflow-hidden` on the box that holds the photograph,
 * which is what clips the bleed, and
 * `scripts/guards/tile-label-over-a-photograph.mjs` fails the build if a caller
 * ever loses that clip.
 */
export function TileCaption({
  children,
  className = '',
}: {
  children: ReactNode
  /** Padding and layout for the label itself, e.g. `p-4 sm:p-5`. */
  className?: string
}) {
  return (
    <div className={`absolute inset-x-0 bottom-0 ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: `calc(-1 * ${TILE_CAPTION_FADE})`,
          /* Past the foot of the tile and both of its edges; the tile's own
           * `overflow-hidden` is what trims it. */
          bottom: '-100vh',
          left: '-100vw',
          right: '-100vw',
          background: TILE_CAPTION_SCRIM,
        }}
      />
      {/* The label rides above its own wash. */}
      <div className="relative">{children}</div>
    </div>
  )
}
