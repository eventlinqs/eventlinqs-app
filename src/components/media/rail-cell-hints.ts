import {
  CITY_TILE_PX,
  COMMUNITY_TILE_PX,
  COMPACT_TILE_PX,
  EVENT_CARD_PX,
  FEATURE_CARD_PX,
  FLAT_RAIL_PX,
  SCENE_TILE_PX,
  SQUARE_CARD_PX,
  STANDARD_TILE_PX,
  WIDE_TILE_PX,
} from '@/lib/ui/rhythm'
import type { MediaSizeKey } from './sizes'

/**
 * THE PAIRING BETWEEN A RAIL CELL AND THE HINT DERIVED FROM IT.
 *
 * ============================================================================
 * WHY THIS IS A FILE OF ITS OWN AND NOT PART OF sizes.ts
 * ============================================================================
 *
 * It lived in `sizes.ts` for about an hour and cost 49,014 bytes of gzip across
 * 61 routes, up to 1,207 bytes on a single dashboard page, and the measurement
 * is what found it rather than a review.
 *
 * `sizes.ts` had always been a LEAF: a file of string constants importing
 * nothing. Putting this table in it gave it an import of `@/lib/ui/rhythm`, and
 * `sizes.ts` is reached by every card, tile and avatar on the platform, so that
 * one edge pulled the whole rhythm module, and the re-chunking that followed,
 * into the first load of routes that render no rails at all. The dashboard grew
 * by 1.2 KB for a table it never reads.
 *
 * NOTHING AT RUNTIME NEEDS THIS. The product needs the finished strings in
 * `MEDIA_SIZES` and nothing else. The PAIRING is needed by two things that never
 * ship to a browser:
 *
 *   - `scripts/guards/image-hints-match-the-cell.mjs`, which reads this file as
 *     TEXT and never imports it, so it can compare the declared hint with the
 *     cell it claims to describe.
 *   - `tests/unit/media/image-hints-match-the-cell.test.ts`, which imports it.
 *
 * So it sits here, where importing rhythm costs a test and a guard and no
 * visitor. `sizes.ts` is a leaf again, which is a property worth keeping
 * deliberately rather than by accident: it is the most widely imported module in
 * the media layer, and anything it imports, everything imports.
 */

/** A rail cell: the two widths a browser needs, and where they are declared. */
type RailCellPx = { readonly cell: string; readonly base: number; readonly sm: number }

/**
 * The rail cells whose hint is derived from a cell width, and the hint key each
 * one owns. The guard reads THIS rather than carrying its own copy of the
 * pairing, because a guard with a private copy of the rule it polices can drift
 * from the code, which is the exact failure the whole item exists to stop.
 */
export const RAIL_CELL_HINTS = [
  { key: 'railEventCard', px: EVENT_CARD_PX, name: 'EVENT_CARD_PX' },
  { key: 'railFeatureCard', px: FEATURE_CARD_PX, name: 'FEATURE_CARD_PX' },
  { key: 'railSquareCard', px: SQUARE_CARD_PX, name: 'SQUARE_CARD_PX' },
  { key: 'railSceneTile', px: SCENE_TILE_PX, name: 'SCENE_TILE_PX' },
  { key: 'railCityTile', px: CITY_TILE_PX, name: 'CITY_TILE_PX' },
  { key: 'railCommunityTile', px: COMMUNITY_TILE_PX, name: 'COMMUNITY_TILE_PX' },
  { key: 'railCompactTile', px: COMPACT_TILE_PX, name: 'COMPACT_TILE_PX' },
  { key: 'railWideTile', px: WIDE_TILE_PX, name: 'WIDE_TILE_PX' },
  { key: 'railStandardTile', px: STANDARD_TILE_PX, name: 'STANDARD_TILE_PX' },
  { key: 'railFlat', px: FLAT_RAIL_PX, name: 'FLAT_RAIL_PX' },
  { key: 'marquee', px: FLAT_RAIL_PX, name: 'FLAT_RAIL_PX' },
] as const satisfies readonly { key: MediaSizeKey; px: RailCellPx; name: string }[]

/**
 * The hint a `sm`-stepped rail cell must declare. ONE definition, imported by
 * the unit tests and re-derived by the guard from the same two numbers, so a
 * change to the rule cannot leave either of them right about a rule the other
 * does not hold.
 */
export function railCellHint(px: { base: number; sm: number }): string {
  /* A cell that does not step at `sm` needs ONE number, not the same number
     twice behind a media query that can never change the answer. */
  if (px.base === px.sm) return `${px.base}px`
  return `(min-width: 640px) ${px.sm}px, ${px.base}px`
}
