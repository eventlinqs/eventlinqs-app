/**
 * The chair glyph and the venue object glyphs: one authored geometry each,
 * exported as SVG path strings (pure, unit-testable, reused by the printed
 * plan) plus lazy Path2D factories for the canvas painter.
 *
 * The chair is ONE silhouette, uniformly scaled, authored in a 100 x 100
 * box with the seat centre at (50, 50). The venue objects keep their own
 * 24-box (OBJECT_BOX) and are unaffected.
 */

/**
 * THE CHAIR: one silhouette, uniformly scaled (founder specification,
 * approved 2026-07-27). The three-tier system it replaces is deleted.
 *
 * The benchmark scales ONE glyph, which is why it still reads as a chair at
 * 14px while our tiers collapsed into stacked bars and then a T shape. So
 * there is one geometry here and one only; size is expressed by scale, and
 * the stroke scales with it (CHAIR_STROKE below), never screen-fixed.
 *
 * The geometry is EXACT on a 100 x 100 box, seat centre (50, 50):
 *
 *   BACK       x 18  y 6   w 64  h 30  r 11
 *   ARM LEFT   x 4   y 40  w 15  h 46  r 7
 *   ARM RIGHT  x 81  y 40  w 15  h 46  r 7
 *   PAN        x 22  y 62  w 56  h 24  r 9
 *
 * Why it reads as furniture, so nobody drifts from it:
 *   - The ARMS are the widest part (x 4..96, 92 wide) and are wider than the
 *     back (x 18..82, 64 wide). That is what stops it reading as stacked bars.
 *   - The middle stays OPEN: back on top, arms down the sides, pan at the
 *     bottom between them, air in between.
 *   - It is symmetric about x = 50 by construction (4 <-> 96, 18 <-> 82,
 *     19 <-> 81, 22 <-> 78), so the mirror test passes by arithmetic.
 */

export interface GlyphRect {
  x: number
  y: number
  w: number
  h: number
  r: number
}

/**
 * THE SPECIFICATION, as data. The path strings below are DERIVED from these
 * rectangles, so a path can never drift from the approved numbers and the
 * numbers themselves are unit-testable.
 */
export const CHAIR_RECTS = {
  back: { x: 18, y: 6, w: 64, h: 30, r: 11 },
  armLeft: { x: 4, y: 40, w: 15, h: 46, r: 7 },
  armRight: { x: 81, y: 40, w: 15, h: 46, r: 7 },
  pan: { x: 22, y: 62, w: 56, h: 24, r: 9 },
} as const satisfies Record<string, GlyphRect>

/** A closed rounded-rectangle path, clockwise from the top-left arc end. */
export function roundedRectPath({ x, y, w, h, r }: GlyphRect): string {
  const n = (v: number) => Number(v.toFixed(4)).toString()
  return (
    `M${n(x + r)} ${n(y)}` +
    `h${n(w - 2 * r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}` +
    `v${n(h - 2 * r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}` +
    `h${n(-(w - 2 * r))}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}` +
    `v${n(-(h - 2 * r))}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}` +
    'Z'
  )
}

/** BACK: x 18 y 6 w 64 h 30 r 11. */
export const CHAIR_BACK_PATH = roundedRectPath(CHAIR_RECTS.back)

/** PAN: x 22 y 62 w 56 h 24 r 9. */
export const CHAIR_PAN_PATH = roundedRectPath(CHAIR_RECTS.pan)

/** ARM LEFT: x 4 y 40 w 15 h 46 r 7. The widest part of the glyph. */
export const CHAIR_ARM_LEFT_PATH = roundedRectPath(CHAIR_RECTS.armLeft)

/** ARM RIGHT: x 81 y 40 w 15 h 46 r 7. The exact mirror of ARM LEFT. */
export const CHAIR_ARM_RIGHT_PATH = roundedRectPath(CHAIR_RECTS.armRight)

/**
 * The stroke weight at the authored box size. It SCALES with the glyph:
 * a painter drawing the chair at width w uses w / GLYPH_BOX * CHAIR_STROKE,
 * so one silhouette keeps its proportions at every size. This replaces the
 * old screen-fixed outline, which was what forced the tier system.
 */
export const CHAIR_STROKE = 6.5

/**
 * The accessibility mark drawn inside the back on accessible seats. The same
 * approved pictogram (head, backrest, arm, wheel), scaled and centred into
 * the 100-box back. Fit is measured, not assumed: with the mark's own stroke
 * of CHAIR_ACCESS_STROKE its ink clears the back's inner edges on all sides.
 */
export const CHAIR_ACCESS_PATH =
  'M50.57 14.52a1.77 1.77 0 1 0 3.54 0a1.77 1.77 0 1 0-3.54 0M52.34 17.08v5.17h4.18M52.34 19.66h3.54M48.3 20.62a4.85 4.85 0 1 0 7.4 5.49'

/** Stroke for the accessibility mark at the authored box size. */
export const CHAIR_ACCESS_STROKE = 4.4

/** The authored box the CHAIR lives in. */
export const GLYPH_BOX = 100

/** The authored box the VENUE OBJECT glyphs live in (unchanged). */
export const OBJECT_BOX = 24

/** Every part of the one chair silhouette, in paint order. */
export const CHAIR_PART_PATHS: readonly string[] = [
  CHAIR_BACK_PATH,
  CHAIR_ARM_LEFT_PATH,
  CHAIR_ARM_RIGHT_PATH,
  CHAIR_PAN_PATH,
]

export interface ChairPaths {
  back: Path2D
  pan: Path2D
  armLeft: Path2D
  armRight: Path2D
  access: Path2D
}

let chairCache: ChairPaths | null = null

/** Browser-only: Path2D objects for the canvas painter, built once. */
export function chairPaths(): ChairPaths {
  if (!chairCache) {
    chairCache = {
      back: new Path2D(CHAIR_BACK_PATH),
      pan: new Path2D(CHAIR_PAN_PATH),
      armLeft: new Path2D(CHAIR_ARM_LEFT_PATH),
      armRight: new Path2D(CHAIR_ARM_RIGHT_PATH),
      access: new Path2D(CHAIR_ACCESS_PATH),
    }
  }
  return chairCache
}

// ── Venue object glyphs ────────────────────────────────────────────────────
// Each is authored in the same 24-box as Night linework; the painter scales
// it into the object's chip. Descriptions live in the direction doc.

export type VenueObjectKind =
  | 'bar'
  | 'food'
  | 'toilet'
  | 'entrance'
  | 'exit'
  | 'stairs'
  | 'lift'
  | 'balcony'
  | 'box'
  | 'rail'

/** Stroked linework paths (drawn with round caps, no fill). */
export const OBJECT_GLYPHS: Record<VenueObjectKind, { paths: string[]; label: string }> = {
  bar: {
    // A coupe glass on a counter line.
    paths: ['M4 20h16', 'M8 4h8l-3.2 5v7', 'M9.8 16h4.4'],
    label: 'Bar',
  },
  food: {
    // Fork and knife flanking a plate circle.
    paths: [
      'M5 4v6M7 4v6M6 10v10M5 4c0 2 2 2 2 0',
      'M12 12m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0',
      'M19 4c-1.5 1-2 3-2 6v10',
    ],
    label: 'Food',
  },
  toilet: {
    // Two door leaves with the paired figures, in line.
    paths: [
      'M3 3h8v18H3Z',
      'M13 3h8v18h-8Z',
      'M7 8m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0M7 10v4m-2 4l2-4l2 4',
      'M17 8m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0M15.4 15h3.2l-1.6-4Zm1.6 0v3',
    ],
    label: 'Toilets',
  },
  entrance: {
    // A doorway gap in a wall line with an inward arrow.
    paths: ['M2 4h6M16 4h6M8 4v3M16 4v3', 'M12 8v10m0 0l-3.5-3.5M12 18l3.5-3.5'],
    label: 'Entrance',
  },
  exit: {
    // The doorway gap with an outward arrow.
    paths: ['M2 20h6M16 20h6M8 20v-3M16 20v-3', 'M12 16V6m0 0L8.5 9.5M12 6l3.5 3.5'],
    label: 'Exit',
  },
  stairs: {
    // Four descending steps in profile with a direction arrow.
    paths: ['M3 19h4v-4h4v-4h4V7h4', 'M5 8l4-4m0 0H5.8M9 4v3.2'],
    label: 'Stairs',
  },
  lift: {
    // A car outline with paired up and down chevrons.
    paths: ['M4 3h16v18H4Z', 'M9 10l3-3l3 3', 'M9 14l3 3l3-3'],
    label: 'Lift',
  },
  balcony: {
    // A curved band with rail ticks along its house edge.
    paths: [
      'M2 18c3-7 7-10 10-10s7 3 10 10',
      'M4.5 14.5l-1.8-1M8 11.4l-1.2-1.5M12 10.2V8.2M16 11.4l1.2-1.5M19.5 14.5l1.8-1',
    ],
    label: 'Balcony',
  },
  box: {
    // A small room outline holding two mid-mark chairs.
    paths: ['M3 4h18v16H3Z', 'M7 12h4v5H7Z', 'M13 12h4v5h-4Z', 'M7.6 12v-1.6h2.8V12M13.6 12v-1.6h2.8V12'],
    label: 'Box',
  },
  rail: {
    // A hatched narrow band with a heavier front rail line.
    paths: ['M2 10h20M2 16h20', 'M5 10l-2 6M10 10l-2 6M15 10l-2 6M20 10l-2 6'],
    label: 'Standing rail',
  },
}

const objectCache = new Map<VenueObjectKind, Path2D[]>()

export function objectPaths(kind: VenueObjectKind): Path2D[] {
  let paths = objectCache.get(kind)
  if (!paths) {
    paths = OBJECT_GLYPHS[kind].paths.map(d => new Path2D(d))
    objectCache.set(kind, paths)
  }
  return paths
}
