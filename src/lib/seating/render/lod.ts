/**
 * Level of detail: the three states of the sheet, as data.
 *
 * The scale `s` is canvas px per world unit. The default seat pitch is 24
 * world units, so the effective chair pitch on screen is 24s px. The
 * thresholds are chosen so each state switches while its content is still
 * legible; the glyph tier is decided by the chair's own on-screen size so
 * charts with custom spacing degrade at the same visual moment as default
 * ones. (Phase 2 deviation from the direction doc, stated: the Seat state
 * begins at s = 0.78 rather than 0.70 so the full chair glyph and the state
 * always switch together; 0.70 left a sliver where the Seat state drew the
 * mid mark.)
 */

export type LodState = 'overview' | 'mid' | 'seat'
export type GlyphTier = 'mark' | 'mid' | 'full'

/** Seat state begins where the full chair glyph is legible (14px at the default pitch). */
export const LOD_OVERVIEW_MAX = 0.3
export const LOD_SEAT_MIN = 0.78
/** Row letters appear on the flanks from this scale (inside the mid state). */
export const ROW_LETTER_MIN = 0.45
/** Numerals appear on chairs from this scale (chair at or above 16px). */
export const NUMERAL_MIN = 0.9

/** The chair's world-unit width as a fraction of the room's seat pitch. */
export const CHAIR_PITCH_RATIO = 0.75

/**
 * Glyph tier by the chair's on-screen width in px: full anatomy (back,
 * gap, pan, armrests) from 20px, back and pan from 10px, one rounded
 * seat-from-above mark below that.
 */
export function glyphTier(chairPx: number): GlyphTier {
  if (chairPx >= 20) return 'full'
  if (chairPx >= 10) return 'mid'
  return 'mark'
}

/** Numerals sit BELOW the chair, and only from this on-screen size. */
export const NUMERAL_CHAIR_PX = 20

export function lodState(scale: number): LodState {
  if (scale < LOD_OVERVIEW_MAX) return 'overview'
  if (scale < LOD_SEAT_MIN) return 'mid'
  return 'seat'
}

export interface LodFlags {
  state: LodState
  /** Chairs draw at all (mid and seat states). */
  seats: boolean
  /** Filled section polygons with name and price range (overview only). */
  polygonFill: boolean
  /** Polygon boundary hairline and pinned label (mid state). */
  polygonEdge: boolean
  /** Row letters on both flanks. */
  rowLetters: boolean
  /** Numerals on chairs and the seat-number ruler along block top edges. */
  numerals: boolean
}

export function lodFlags(scale: number): LodFlags {
  const state = lodState(scale)
  return {
    state,
    seats: state !== 'overview',
    polygonFill: state === 'overview',
    polygonEdge: state === 'mid',
    rowLetters: state === 'seat' || (state === 'mid' && scale >= ROW_LETTER_MIN),
    numerals: state === 'seat' && scale >= NUMERAL_MIN,
  }
}
