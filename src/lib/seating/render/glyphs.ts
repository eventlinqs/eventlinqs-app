/**
 * The chair glyph and the venue object glyphs: one authored geometry each,
 * exported as SVG path strings (pure, unit-testable, reused by the printed
 * plan) plus lazy Path2D factories for the canvas painter.
 *
 * The chair reads as furniture: a narrow back over a wider pan, drawn from
 * the front. One silhouette, three sizes (full, mid, mark), all authored in
 * a 24 x 24 box with the seat centre at (12, 12).
 */

import type { GlyphTier } from './lod'

/**
 * The chair, redrawn 2026-07-27 to the benchmark's tub-chair anatomy: ONE
 * closed silhouette, PERFECTLY SYMMETRICAL about the vertical centreline
 * x = 12. Every horizontal coordinate below pairs under the mirror
 * m(x) = 24 - x (1 <-> 23, 4.3 <-> 19.7), which is what makes the mirrored
 * halves match exactly. The proof rasterises each tier and compares it
 * against its own horizontal flip, so a future edit that breaks the pairing
 * fails visibly instead of shipping.
 *
 * Anatomy, in the authored 24-box, drawn extent inset to x 1..23 so the
 * screen-fixed outline never clips at the box edge (glyph width W = 22,
 * assembly height 20.46, aspect 1.075: square, slightly wider than tall):
 *
 *   BACK  full glyph width, top 45% of the assembly, r = 30% of its height
 *   GAP   8% of the assembly height, still open at 24px
 *   PAN   70% of glyph width, centred, the lower 40%
 *   ARMS  15% of glyph width each, pan edge to glyph edge, pan height
 *
 * The armrests are SUPPORTING: they sit inside the back's own width and
 * never outboard of it, which is what the previous revision broke by
 * scaling them into the dominant forms.
 *
 * Three degradation tiers, one silhouette throughout: full (back, pan,
 * arms), mid (back and pan, the identical paths minus the arms), mark (one
 * closed stepped form, never a plain square).
 */

/** Back: x 1..23 (w 22, full glyph width), y 1.77..11.67 (h 9.9), r 3. */
export const CHAIR_BACK_PATH =
  'M4 1.77h16a3 3 0 0 1 3 3v3.9a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4.77a3 3 0 0 1 3-3Z'

/** Pan: x 4.3..19.7 (w 15.4, 70% of glyph width), y 13.43..22.23 (h 8.8), r 2.2. */
export const CHAIR_PAN_PATH =
  'M6.5 13.43h11a2.2 2.2 0 0 1 2.2 2.2v4.4a2.2 2.2 0 0 1-2.2 2.2h-11a2.2 2.2 0 0 1-2.2-2.2v-4.4a2.2 2.2 0 0 1 2.2-2.2Z'

/**
 * Armrests: narrow verticals (w 3.3 = 15% of glyph width) filling the space
 * between the pan's edge and the glyph's edge, at the pan's own height so
 * the lower band reads as one seat. Left x 1..4.3, right x 19.7..23: exact
 * mirrors.
 */
export const CHAIR_ARM_LEFT_PATH =
  'M2.2 13.43h0.9a1.2 1.2 0 0 1 1.2 1.2v6.4a1.2 1.2 0 0 1-1.2 1.2h-0.9a1.2 1.2 0 0 1-1.2-1.2v-6.4a1.2 1.2 0 0 1 1.2-1.2Z'
export const CHAIR_ARM_RIGHT_PATH =
  'M20.9 13.43h0.9a1.2 1.2 0 0 1 1.2 1.2v6.4a1.2 1.2 0 0 1-1.2 1.2h-0.9a1.2 1.2 0 0 1-1.2-1.2v-6.4a1.2 1.2 0 0 1 1.2-1.2Z'

/**
 * The MID tier (10 to 20px) is the SAME back and pan minus the armrests, so
 * the silhouette does not change shape as the map zooms: the back keeps the
 * full glyph width and the pan stays at 70%, which is what keeps it reading
 * as a chair rather than as two equal stacked bars.
 */
export const CHAIR_MID_BACK_PATH = CHAIR_BACK_PATH
export const CHAIR_MID_PAN_PATH = CHAIR_PAN_PATH

/**
 * Mark below 10px: ONE closed chair silhouette, a full-width back stepping
 * in to a narrower pan. The step is 4.5 units per side (1.5px at 8px), so
 * the notch where back meets pan survives at the smallest size. Never a
 * plain square.
 *
 * The pan here is 59% of glyph width, narrower than the 70% the full and
 * mid tiers use, and that difference is deliberate. Variants at 70% were
 * rendered at 6, 8 and 10px and compared: at 6px a 3.3-unit step washes out
 * and the glyph collapses to a rounded square, which is the one outcome
 * this tier may not produce. 4.5 units per side is the smallest step that
 * still reads at 6px.
 */
export const CHAIR_MARK_PATH =
  'M4 1.77h16a3 3 0 0 1 3 3v7.73h-4.5v7.33a2.4 2.4 0 0 1-2.4 2.4H7.9a2.4 2.4 0 0 1-2.4-2.4V12.5H1V4.77a3 3 0 0 1 3-3Z'

/**
 * The accessibility mark drawn inside the back on accessible seats.
 *
 * The SAME pictogram as before (head, backrest, arm, wheel), uniformly
 * scaled to 0.655 and recentred on the glyph's centreline so it sits inside
 * the redrawn back with clear margin. It needed refitting: measured against
 * the old back it already overran the bottom stroke by 0.98 units, and the
 * redrawn back is 1.23 units shorter, which took the overrun to 2.21. The
 * scale accounts for the 1.3 stroke, which adds 0.65 of ink beyond the path
 * on every side: ink now clears both the back's top and bottom strokes.
 * Re-measure the same way if either shape changes.
 */
export const CHAIR_ACCESS_PATH =
  'M11.48 4.07a0.72 0.72 0 1 0 1.44 0a0.72 0.72 0 1 0-1.44 0M12.2 5.11v2.1h1.7M12.2 6.16h1.44M10.56 6.55a1.97 1.97 0 1 0 3.01 2.23'

/** The authored box every glyph lives in. */
export const GLYPH_BOX = 24

export interface ChairPaths {
  back: Path2D
  pan: Path2D
  armLeft: Path2D
  armRight: Path2D
  midBack: Path2D
  midPan: Path2D
  mark: Path2D
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
      midBack: new Path2D(CHAIR_MID_BACK_PATH),
      midPan: new Path2D(CHAIR_MID_PAN_PATH),
      mark: new Path2D(CHAIR_MARK_PATH),
      access: new Path2D(CHAIR_ACCESS_PATH),
    }
  }
  return chairCache
}

/** Which authored parts a glyph tier draws (painter and print alike). */
export function chairTierParts(tier: GlyphTier): ('back' | 'pan' | 'arms' | 'mark')[] {
  if (tier === 'full') return ['back', 'pan', 'arms']
  if (tier === 'mid') return ['back', 'pan']
  return ['mark']
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
