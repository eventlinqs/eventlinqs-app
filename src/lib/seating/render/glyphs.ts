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
 * The chair, matched to the benchmark's anatomy: a TALL rounded BACK, two
 * TALL ARMREST VERTICALS flanking the seat pan at full stroke weight (the
 * founder's Correction 1: armrests must read unmistakably as armrests at
 * 24px, visibly separate from both the back and the pan), and the PAN
 * between them. Every part keeps a >= 1.8-unit clear gap from its
 * neighbours so the separation survives the stroke. Three degradation
 * tiers: full (back, pan, arms), mid (back, pan), mark (one form).
 */

/** Back: x 6..18 (w 12), y 1.7..12.9 (h 11.2), r 3. */
export const CHAIR_BACK_PATH =
  'M9 1.7h6a3 3 0 0 1 3 3v5.2a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V4.7a3 3 0 0 1 3-3Z'

/** Pan: x 6..18, y 14.7..22.3 (h 7.6), r 2.4: between the armrests. */
export const CHAIR_PAN_PATH =
  'M8.4 14.7h7.2a2.4 2.4 0 0 1 2.4 2.4v2.8a2.4 2.4 0 0 1-2.4 2.4H8.4A2.4 2.4 0 0 1 6 19.9v-2.8a2.4 2.4 0 0 1 2.4-2.4Z'

/**
 * Armrests: TALL verticals (w 3.2, h 12.6, more than half the glyph's
 * height) flanking the pan, rounded both ends, with a 2-unit clear
 * channel to the back and the pan so they read as their own strokes at
 * 24px under the 1.25px screen-fixed outline.
 */
export const CHAIR_ARM_LEFT_PATH =
  'M0.8 10.3a1.6 1.6 0 0 1 3.2 0v9.4a1.6 1.6 0 0 1-3.2 0Z'
export const CHAIR_ARM_RIGHT_PATH =
  'M20 10.3a1.6 1.6 0 0 1 3.2 0v9.4a1.6 1.6 0 0 1-3.2 0Z'

/**
 * The MID tier (10 to 20px) drops the armrests, so its back and pan widen
 * to the full box and the chair keeps its presence at small sizes; the
 * full tier's narrower parts exist only to make room for the armrest
 * verticals. Back: x 3..21, y 1.7..12.9, r 3.2. Pan: x 4..20, y
 * 14.7..22.3, r 2.4.
 */
export const CHAIR_MID_BACK_PATH =
  'M6.2 1.7h11.6a3.2 3.2 0 0 1 3.2 3.2v4.8a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 9.7V4.9a3.2 3.2 0 0 1 3.2-3.2Z'
export const CHAIR_MID_PAN_PATH =
  'M6.4 14.7h11.2a2.4 2.4 0 0 1 2.4 2.4v2.8a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 19.9v-2.8a2.4 2.4 0 0 1 2.4-2.4Z'

/** Mark below 10px: one rounded seat-from-above form, wider than tall. */
export const CHAIR_MARK_PATH =
  'M6 4h12a4 4 0 0 1 4 4v9a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 17V8a4 4 0 0 1 4-4Z'

/** The accessibility mark drawn inside the back on accessible seats. */
export const CHAIR_ACCESS_PATH =
  'M10.6 3.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M11.7 5v3.2h2.6M11.7 6.6h2.2M9.2 7.2a3 3 0 1 0 4.6 3.4'

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
