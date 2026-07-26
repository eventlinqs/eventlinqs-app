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
 * The chair, matched to the benchmark's anatomy and viewed from behind and
 * above: a wide rounded BACK across the top ~45%, a clear GAP (~8% of the
 * glyph, visible at 24px), a slightly NARROWER PAN across the lower ~40%,
 * and two short ARMREST strokes flanking the pan. One silhouette, three
 * degradation tiers.
 */

/** Back: x 3..21 (w 18), y 1..11.8 (h 10.8), r 3.2 (~30% of its height). */
export const CHAIR_BACK_PATH =
  'M6.2 1h11.6a3.2 3.2 0 0 1 3.2 3.2v4.4a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 8.6V4.2A3.2 3.2 0 0 1 6.2 1Z'

/** Pan: x 5..19 (w 14, narrower than the back), y 13.7..23.3, r 2.8. */
export const CHAIR_PAN_PATH =
  'M7.8 13.7h8.4a2.8 2.8 0 0 1 2.8 2.8v4a2.8 2.8 0 0 1-2.8 2.8H7.8A2.8 2.8 0 0 1 5 20.5v-4a2.8 2.8 0 0 1 2.8-2.8Z'

/** Armrests: short vertical bars flanking the pan (~30% of pan height). */
export const CHAIR_ARM_LEFT_PATH =
  'M3.5 13.7a0.8 0.8 0 0 1 0.8 0.8v2a0.8 0.8 0 0 1-1.6 0v-2a0.8 0.8 0 0 1 0.8-0.8Z'
export const CHAIR_ARM_RIGHT_PATH =
  'M20.5 13.7a0.8 0.8 0 0 1 0.8 0.8v2a0.8 0.8 0 0 1-1.6 0v-2a0.8 0.8 0 0 1 0.8-0.8Z'

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
