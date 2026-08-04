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

/** Seat state begins where the chair glyph is legible (14px at the default pitch). */
export const LOD_OVERVIEW_MAX = 0.3
export const LOD_SEAT_MIN = 0.78

/** The chair's world-unit width as a fraction of the room's seat pitch. */
export const CHAIR_PITCH_RATIO = 0.75

/**
 * THE LEGIBILITY FLOOR. Below this on-screen chair width a chair cannot read
 * as furniture at any stroke, so the map shows SECTION POLYGONS instead of
 * seats. A buyer-facing plan never degrades a chair into an abstract mark at
 * any viewport width: at 390 a fitted room lands around 6 to 8px per chair,
 * which is exactly the case this floor catches.
 */
export const MIN_CHAIR_PX = 10

/** Whether the chair is big enough on screen to draw as a chair. */
export function chairsLegible(chairPx: number): boolean {
  return chairPx >= MIN_CHAIR_PX
}

export function lodState(scale: number): LodState {
  if (scale < LOD_OVERVIEW_MAX) return 'overview'
  if (scale < LOD_SEAT_MIN) return 'mid'
  return 'seat'
}

export interface LodFlags {
  state: LodState
  /** Chairs draw at all (mid and seat states, and only above the floor). */
  seats: boolean
  /** Filled section polygons with name and price range. */
  polygonFill: boolean
  /** Row letters on both flanks: on the plan whenever the chairs are. */
  rowLetters: boolean
  /** The per-block seat-number ruler: on the plan whenever the chairs are. */
  rulers: boolean
}

/**
 * `chairPx` is the chair's on-screen width. Pass it wherever it is known:
 * when the chairs would fall below the legibility floor the plan switches to
 * polygons, exactly as it does at overview. Omitting it keeps the pure
 * scale-driven behaviour for callers that have no scene (label placement
 * tests, for instance).
 */
export function lodFlags(scale: number, chairPx?: number): LodFlags {
  const state = lodState(scale)
  const legible = chairPx === undefined || chairsLegible(chairPx)
  const drawSeats = state !== 'overview' && legible
  return {
    state,
    seats: drawSeats,
    polygonFill: !drawSeats,
    rowLetters: drawSeats,
    rulers: drawSeats,
  }
}
