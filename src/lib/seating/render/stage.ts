/**
 * The stage as geometry: four shapes the organiser picks from, each a pure
 * polygon or path in world units. No labelled rectangle: the painter fills
 * the shape with the paper tone, hatches it at 45 degrees, outlines it in
 * ink and draws the apron line on the house edge.
 *
 * The apron midpoint doubles as the chart's focal point for the
 * best-available cascade, so choosing a stage shape also sharpens "best".
 */

export type StageShape = 'proscenium' | 'thrust' | 'round' | 'band'

export interface StageSpec {
  shape: StageShape
  /** Top-left of the stage's bounding box in world units. */
  x: number
  y: number
  width: number
  depth: number
  rotation?: number
}

export const STAGE_SHAPE_META: { shape: StageShape; label: string; hint: string }[] = [
  { shape: 'proscenium', label: 'Proscenium', hint: 'Recedes upstage, apron into the house' },
  { shape: 'thrust', label: 'Thrust', hint: 'A tongue into the seating, three sides' },
  { shape: 'round', label: 'In the round', hint: 'The house faces inward' },
  { shape: 'band', label: 'Flat floor', hint: 'A hall deck, front line only' },
]

export interface StageGeometry {
  /** Closed outline as world-unit points (polygonal shapes). */
  outline: { x: number; y: number }[]
  /** The house-edge apron line, drawn heavier. */
  apron: { x: number; y: number }[]
  /** Ellipse shapes carry their parameters instead of points. */
  ellipse?: { cx: number; cy: number; rx: number; ry: number }
  /** Where the word Stage sits. */
  labelAt: { x: number; y: number }
  /** The cascade's focal point: the apron midpoint (centre for the round). */
  focal: { x: number; y: number }
}

function rotatePoints(
  pts: { x: number; y: number }[],
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number }[] {
  if (!deg) return pts
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return pts.map(p => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }))
}

/**
 * Geometry for a stage spec. The house is assumed below the stage (larger
 * y); rotation turns the whole figure for side or corner stages.
 */
export function stageGeometry(spec: StageSpec): StageGeometry {
  const { x, y, width: w, depth: d } = spec
  const cx = x + w / 2
  const cy = y + d / 2
  const rot = spec.rotation ?? 0
  const withRotation = (g: StageGeometry): StageGeometry => ({
    ...g,
    outline: rotatePoints(g.outline, cx, cy, rot),
    apron: rotatePoints(g.apron, cx, cy, rot),
    labelAt: rotatePoints([g.labelAt], cx, cy, rot)[0],
    focal: rotatePoints([g.focal], cx, cy, rot)[0],
  })

  if (spec.shape === 'proscenium') {
    // Trapezoid receding upstage: back edge 0.72 of the front, plus a
    // shallow apron arc bulging 0.12 of the depth into the house.
    const inset = (w * (1 - 0.72)) / 2
    const bulge = d * 0.12
    const outline = [
      { x: x + inset, y },
      { x: x + w - inset, y },
      { x: x + w, y: y + d },
      { x, y: y + d },
    ]
    // The apron arc, sampled: front edge bowed toward the house.
    const apron: { x: number; y: number }[] = []
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      apron.push({ x: x + t * w, y: y + d + Math.sin(Math.PI * t) * bulge })
    }
    return withRotation({
      outline,
      apron,
      labelAt: { x: cx, y: y + d - 8 },
      focal: { x: cx, y: y + d + bulge / 2 },
    })
  }

  if (spec.shape === 'thrust') {
    // Upstage band half the depth, then a tongue 0.55 of the width
    // projecting the rest of the way, front corners rounded by sampling.
    const tw = w * 0.55
    const tx0 = cx - tw / 2
    const tx1 = cx + tw / 2
    const bandBottom = y + d * 0.5
    const r = Math.min(w * 0.08, tw / 2, d * 0.25)
    const outline: { x: number; y: number }[] = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: bandBottom },
      { x: tx1, y: bandBottom },
      { x: tx1, y: y + d - r },
    ]
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2)
      outline.push({ x: tx1 - r + Math.cos(a) * r, y: y + d - r + Math.sin(a) * r })
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (i / 8) * (Math.PI / 2)
      outline.push({ x: tx0 + r + Math.cos(a) * r, y: y + d - r + Math.sin(a) * r })
    }
    outline.push({ x: tx0, y: bandBottom }, { x, y: bandBottom })
    const apron = outline.slice(4, 4 + 18 + 1)
    return withRotation({
      outline,
      apron,
      labelAt: { x: cx, y: y + d * 0.32 },
      focal: { x: cx, y: y + d - r / 2 },
    })
  }

  if (spec.shape === 'round') {
    const rx = w / 2
    const ry = d / 2
    // The apron is the full rim: sampled for the heavier line.
    const apron: { x: number; y: number }[] = []
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2
      apron.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
    }
    return withRotation({
      outline: apron,
      apron,
      ellipse: { cx, cy, rx, ry },
      labelAt: { x: cx, y: cy },
      focal: { x: cx, y: cy },
    })
  }

  // Flat-floor band: a full-width strip, hatched, only the front line drawn
  // heavy. Depth is the spec depth clamped shallow.
  const bd = Math.min(d, Math.max(24, d * 0.35 + 24))
  const outline = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + bd },
    { x, y: y + bd },
  ]
  return withRotation({
    outline,
    apron: [
      { x, y: y + bd },
      { x: x + w, y: y + bd },
    ],
    labelAt: { x: cx, y: y + bd / 2 },
    focal: { x: cx, y: y + bd },
  })
}

/**
 * The default stage for a chart that predates stage geometry: a proscenium
 * spanning 60% of the seat field's width, sitting one pitch above the front
 * row. Every existing chart gets architecture with no migration.
 */
export function defaultStageForBounds(bounds: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): StageSpec {
  const roomW = Math.max(120, bounds.maxX - bounds.minX)
  const w = roomW * 0.6
  const depth = Math.min(90, Math.max(48, roomW * 0.12))
  return {
    shape: 'proscenium',
    x: bounds.minX + (roomW - w) / 2,
    y: bounds.minY - depth - 36,
    width: w,
    depth,
  }
}
