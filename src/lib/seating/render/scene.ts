/**
 * The retained scene graph: the room built once from data, then painted
 * many times. Pure and DOM-free so the geometry, the spatial index and the
 * culling are unit-tested; the canvas component owns only the camera, the
 * paint loop and the gestures.
 */

import { convexHull, polygonCentroid, type SectionPolygon } from './polygons'
import { defaultStageForBounds, stageGeometry, type StageGeometry, type StageSpec } from './stage'
import type { VenueObjectKind } from './glyphs'
import { CHAIR_PITCH_RATIO } from './lod'

export interface SceneSeatInput {
  id: string
  x: number
  y: number
  row_label: string
  seat_number: string
  seat_type: string
  status: string
  seat_map_section_id: string | null
  ticket_tier_id: string | null
  price_cents?: number | null
}

export interface SceneSectionInput {
  id: string
  name: string
  color: string
}

export interface SceneAreaInput {
  label: string
  color: string
  x: number
  y: number
  width: number
  height: number
  style?: 'zone' | 'scenery'
  tier_name?: string
  /**
   * The zone's price, resolved from its bound tier by the caller. A zone holds
   * no seats, so unlike a seated section its price cannot be derived from the
   * plan: without this the zone was the only shape on the map carrying a name
   * and no price. Null or absent means genuinely unpriced (scenery), and the
   * plan then shows the name alone.
   */
  priceCents?: number | null
}

export interface SceneObjectInput {
  kind: 'object' | 'text' | 'icon'
  object?: VenueObjectKind
  text?: string
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  label?: string
  size?: number
}

export interface SceneInput {
  seats: SceneSeatInput[]
  sections: SceneSectionInput[]
  areas?: SceneAreaInput[]
  stage?: StageSpec | null
  objects?: SceneObjectInput[]
  /** Price per seat, resolved by the caller (tier map plus default). */
  priceForSeat?: (seat: SceneSeatInput) => number | null
  /** Hue per seat: ticket type is the primary colour encoding. */
  colorForSeat?: (seat: SceneSeatInput) => string
}

export interface RowLabelAnchor {
  key: string
  label: string
  /** Flank positions: one letter each side of the row. */
  left: { x: number; y: number }
  right: { x: number; y: number }
}

export interface RulerMark {
  x: number
  y: number
  text: string
}

export interface SceneBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface TableLabelAnchor {
  /** The table's own name, exactly as the organiser set it. */
  label: string
  /** The ring centre, in world units. */
  x: number
  y: number
  /** Half the ring's width, so a label can be sized to the table. */
  radius: number
}

export interface Scene {
  seats: SceneSeatInput[]
  seatColor: string[]
  seatPrice: (number | null)[]
  bounds: SceneBounds
  /**
   * Bounds of the SEATS alone (no stage, areas or objects): the row
   * letter gutters hang a fixed distance off this field's outer flanks,
   * the benchmark's grammar, whatever the block count.
   */
  seatField: SceneBounds
  /**
   * The bounds the CAMERA FIT frames: seats, stage and sellable zones, but
   * NOT venue fixtures. See the note where it is built.
   */
  fitBounds: SceneBounds
  /**
   * Contiguous seat blocks: spatial clusters split by real aisle gaps,
   * table seats excluded, ordered left to right. Any number of blocks;
   * rulers and block-aware chrome derive from these automatically.
   */
  blocks: number[][]
  /** Median nearest-neighbour distance: the room's seat pitch. */
  pitch: number
  /** The chair's world width, derived from the pitch. */
  chairW: number
  polygons: SectionPolygon[]
  rowLabels: RowLabelAnchor[]
  /**
   * One anchor per table or booth, at the ring's centre, carrying that
   * table's own name. Tables sit outside the block system, so without this
   * they carried no identity at all on the plan.
   */
  tableLabels: TableLabelAnchor[]
  rulers: RulerMark[]
  stage: StageGeometry | null
  stageSpec: StageSpec | null
  areas: SceneAreaInput[]
  objects: SceneObjectInput[]
  /** Spatial hash: cell key to seat indices. */
  grid: Map<string, number[]>
  cell: number
}

const DEFAULT_PITCH = 24

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`
}

/**
 * Single-linkage spatial clustering over a grid: indices whose seats sit
 * within `threshold` of each other share a cluster. Splits a section's
 * disjoint blocks (boxes on both flanks) into their own polygons.
 */
function clusterIndices(
  indices: number[],
  seats: { x: number; y: number }[],
  threshold: number,
): number[][] {
  if (indices.length <= 1) return [indices]
  const cell = threshold
  const grid = new Map<string, number[]>()
  for (const i of indices) {
    const key = cellKey(Math.floor(seats[i].x / cell), Math.floor(seats[i].y / cell))
    const bucket = grid.get(key)
    if (bucket) bucket.push(i)
    else grid.set(key, [i])
  }
  const parent = new Map<number, number>()
  const find = (i: number): number => {
    let root = i
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = i
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  for (const i of indices) parent.set(i, i)
  const t2 = threshold * threshold
  for (const i of indices) {
    const cx = Math.floor(seats[i].x / cell)
    const cy = Math.floor(seats[i].y / cell)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(cellKey(cx + dx, cy + dy))
        if (!bucket) continue
        for (const j of bucket) {
          if (j <= i) continue
          const ddx = seats[i].x - seats[j].x
          const ddy = seats[i].y - seats[j].y
          if (ddx * ddx + ddy * ddy <= t2) parent.set(find(i), find(j))
        }
      }
    }
  }
  const byRoot = new Map<number, number[]>()
  for (const i of indices) {
    const root = find(i)
    const list = byRoot.get(root)
    if (list) list.push(i)
    else byRoot.set(root, [i])
  }
  return [...byRoot.values()]
}

/** Median distance to the nearest neighbour, sampled for large rooms. */
export function estimatePitch(seats: { x: number; y: number }[]): number {
  if (seats.length < 2) return DEFAULT_PITCH
  const sample = seats.length > 400 ? seats.filter((_, i) => i % Math.ceil(seats.length / 400) === 0) : seats
  const dists: number[] = []
  for (const s of sample) {
    let best = Infinity
    for (const o of seats) {
      if (o === s) continue
      const d = Math.hypot(o.x - s.x, o.y - s.y)
      if (d < best) best = d
      if (best < 4) break
    }
    if (Number.isFinite(best)) dists.push(best)
  }
  dists.sort((a, b) => a - b)
  const median = dists[Math.floor(dists.length / 2)]
  return Number.isFinite(median) && median > 4 ? median : DEFAULT_PITCH
}

export function buildScene(input: SceneInput): Scene {
  const seats = input.seats
  const sectionsById = new Map(input.sections.map(s => [s.id, s]))

  // Bounds span seats, areas, and the stage once resolved.
  const xs: number[] = []
  const ys: number[] = []
  for (const s of seats) {
    xs.push(s.x)
    ys.push(s.y)
  }
  for (const a of input.areas ?? []) {
    xs.push(a.x, a.x + a.width)
    ys.push(a.y, a.y + a.height)
  }
  const seatBounds: SceneBounds =
    xs.length > 0
      ? {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        }
      : { minX: 0, minY: 0, maxX: 400, maxY: 300 }

  const pitch = estimatePitch(seats)
  const chairW = pitch * CHAIR_PITCH_RATIO

  const stageSpec = input.stage ?? defaultStageForBounds(seatBounds)
  const stage = stageGeometry(stageSpec)

  const bounds: SceneBounds = { ...seatBounds }
  for (const p of stage.outline) {
    bounds.minX = Math.min(bounds.minX, p.x)
    bounds.minY = Math.min(bounds.minY, p.y)
    bounds.maxX = Math.max(bounds.maxX, p.x)
    bounds.maxY = Math.max(bounds.maxY, p.y)
  }
  for (const p of stage.apron) {
    bounds.maxY = Math.max(bounds.maxY, p.y)
  }
  // THE ROOM, without the fixtures: what the fit should frame.
  // `bounds` grows to contain every venue object too, because panning and
  // culling must reach them. But a fit computed on THAT box is dominated by
  // fixtures sitting far outside the seating: on the proof theatre the exit
  // markers at x -70 and x 1100 and the entrance at y 610 stretched the box
  // from 864 x 498 (the actual room) to 1170 x 624, which shrank the drawn
  // room by about 26 per cent and left a third of the mobile canvas empty.
  // The fit therefore frames the room, and the areas that sell, alone.
  const fitBounds: SceneBounds = { ...bounds }
  for (const a of input.areas ?? []) {
    fitBounds.minX = Math.min(fitBounds.minX, a.x)
    fitBounds.minY = Math.min(fitBounds.minY, a.y)
    fitBounds.maxX = Math.max(fitBounds.maxX, a.x + a.width)
    fitBounds.maxY = Math.max(fitBounds.maxY, a.y + a.height)
  }

  for (const o of input.objects ?? []) {
    bounds.minX = Math.min(bounds.minX, o.x)
    bounds.minY = Math.min(bounds.minY, o.y)
    bounds.maxX = Math.max(bounds.maxX, o.x + (o.width ?? 48))
    bounds.maxY = Math.max(bounds.maxY, o.y + (o.height ?? 48))
  }
  for (const a of input.areas ?? []) {
    bounds.minX = Math.min(bounds.minX, a.x)
    bounds.minY = Math.min(bounds.minY, a.y)
    bounds.maxX = Math.max(bounds.maxX, a.x + a.width)
    bounds.maxY = Math.max(bounds.maxY, a.y + a.height)
  }

  // Per-seat display data resolved once.
  const seatColor = seats.map(s => input.colorForSeat?.(s) ?? '#1F5673')
  const seatPrice = seats.map(s => input.priceForSeat?.(s) ?? s.price_cents ?? null)

  // Section polygons from seat hulls, price ranges from resolved prices.
  const bySection = new Map<string, number[]>()
  seats.forEach((s, i) => {
    if (!s.seat_map_section_id) return
    const list = bySection.get(s.seat_map_section_id)
    if (list) list.push(i)
    else bySection.set(s.seat_map_section_id, [i])
  })
  const polygons: SectionPolygon[] = []
  for (const [sectionId, indices] of bySection) {
    const section = sectionsById.get(sectionId)
    if (!section) continue
    const prices = indices.map(i => seatPrice[i]).filter((p): p is number => p != null)
    // Dominant tier hue: the most common resolved seat colour in the section.
    const hueCount = new Map<string, number>()
    for (const i of indices) hueCount.set(seatColor[i], (hueCount.get(seatColor[i]) ?? 0) + 1)
    const dominant = [...hueCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? section.color
    // A split section (boxes flanking the room) hulls PER SPATIAL CLUSTER,
    // never as one band across the house: single-linkage clustering at
    // three pitches, cheap at chart sizes.
    const clusters = clusterIndices(indices, seats, pitch * 3)
    for (const cluster of clusters) {
      // The convex hull, always: a deliberate taper reads as a clean
      // trapezoid, and the serrated row-traced edges are off the plan
      // for good (the restraint law).
      const hull = convexHull(cluster.map(i => ({ x: seats[i].x, y: seats[i].y })))
      // A cluster that IS one table names itself after that table. Without
      // this, a cabaret room drew a dozen identical "FLOOR TABLES" blobs at
      // overview and a buyer could not tell one from another; with it, each
      // polygon carries the name the buyer will actually book against. A
      // cluster spanning two tables keeps the section name, which is the
      // honest label for a group.
      const clusterRowLabels = new Set(cluster.map(i => seats[i].row_label))
      const singleTable =
        clusterRowLabels.size === 1 && /table|booth/i.test([...clusterRowLabels][0])
      const prices2 = cluster.map(i => seatPrice[i]).filter((p): p is number => p != null)
      polygons.push({
        sectionId,
        name: singleTable ? [...clusterRowLabels][0] : section.name,
        hull,
        centroid: polygonCentroid(hull),
        pad: pitch,
        // Prices come from THIS cluster, not the whole section, so a per-table
        // polygon states its own price rather than the section's range.
        minPriceCents: prices2.length ? Math.min(...prices2) : prices.length ? Math.min(...prices) : null,
        maxPriceCents: prices2.length ? Math.max(...prices2) : prices.length ? Math.max(...prices) : null,
        color: dominant,
        seatIndices: cluster,
      })
    }
  }

  // The seat field: seats alone, the datum the gutters hang off.
  const seatField: SceneBounds =
    seats.length > 0
      ? {
          minX: Math.min(...seats.map(s => s.x)),
          minY: Math.min(...seats.map(s => s.y)),
          maxX: Math.max(...seats.map(s => s.x)),
          maxY: Math.max(...seats.map(s => s.y)),
        }
      : { ...seatBounds }

  // ── Blocks: contiguous seat clusters split by real aisle gaps, ANY
  // count, ordered left to right. Tables sit outside the block system
  // (they label through their own geometry). The 1.9-pitch threshold
  // holds a block together across half-pitch offsets (diagonal 1.12
  // pitch) and splits at any aisle one pitch wide or more. ──
  const gridSeatIndices: number[] = []
  const tableSeatsByLabel = new Map<string, number[]>()
  seats.forEach((s, i) => {
    if (/table|booth/i.test(s.row_label)) {
      const list = tableSeatsByLabel.get(s.row_label)
      if (list) list.push(i)
      else tableSeatsByLabel.set(s.row_label, [i])
      return
    }
    gridSeatIndices.push(i)
  })

  // ── Table names: one anchor per table, at its ring centre. Tables sit
  // outside the block system, so this is the only place they can carry
  // their own identity on the plan. ──
  const tableLabels: TableLabelAnchor[] = []
  for (const [label, indices] of tableSeatsByLabel) {
    if (indices.length === 0) continue
    const xs = indices.map(i => seats[i].x)
    const ys = indices.map(i => seats[i].y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const radius = Math.max(
      (Math.max(...xs) - Math.min(...xs)) / 2,
      (Math.max(...ys) - Math.min(...ys)) / 2,
    )
    tableLabels.push({ label, x: cx, y: cy, radius })
  }
  tableLabels.sort((a, b) => a.y - b.y || a.x - b.x)
  const blocks = clusterIndices(gridSeatIndices, seats, pitch * 1.9).sort((a, b) => {
    const ax = a.reduce((sum, i) => sum + seats[i].x, 0) / a.length
    const bx = b.reduce((sum, i) => sum + seats[i].x, 0) / b.length
    return ax - bx
  })

  // ── Row letters: ONE line per row across the whole room, whatever the
  // block count. Seats sharing a label cluster spatially; horizontal
  // lines at the same height merge (a row crossing three blocks is one
  // row), and the letters anchor one pitch off the seat field's OUTER
  // flanks, the benchmark's fixed gutters. Rotated galleries (vertical
  // lines) keep letters at their own two ends. ──
  const rowLabels: RowLabelAnchor[] = []
  const byLabel = new Map<string, number[]>()
  for (const i of gridSeatIndices) {
    const list = byLabel.get(seats[i].row_label)
    if (list) list.push(i)
    else byLabel.set(seats[i].row_label, [i])
  }
  for (const [label, indices] of byLabel) {
    const lineYs: number[] = []
    for (const cluster of clusterIndices(indices, seats, pitch * 1.9)) {
      const cxs = cluster.map(i => seats[i].x)
      const cys = cluster.map(i => seats[i].y)
      const xExt = Math.max(...cxs) - Math.min(...cxs)
      const yExt = Math.max(...cys) - Math.min(...cys)
      if (xExt >= yExt) {
        lineYs.push(cys.reduce((a, b) => a + b, 0) / cys.length)
        continue
      }
      // A rotated gallery row: letters at its own two ends.
      let top = cluster[0]
      let bottom = cluster[0]
      for (const i of cluster) {
        if (seats[i].y < seats[top].y) top = i
        if (seats[i].y > seats[bottom].y) bottom = i
      }
      rowLabels.push({
        key: `v:${label}:${seats[top].x.toFixed(0)}:${seats[top].y.toFixed(0)}`,
        label,
        left: { x: seats[top].x, y: seats[top].y - pitch },
        right: { x: seats[bottom].x, y: seats[bottom].y + pitch },
      })
    }
    lineYs.sort((a, b) => a - b)
    let acc: { sum: number; n: number } | null = null
    const mergedYs: number[] = []
    for (const y of lineYs) {
      if (acc && Math.abs(y - acc.sum / acc.n) <= pitch * 0.6) {
        acc.sum += y
        acc.n++
      } else {
        if (acc) mergedYs.push(acc.sum / acc.n)
        acc = { sum: y, n: 1 }
      }
    }
    if (acc) mergedYs.push(acc.sum / acc.n)
    for (const y of mergedYs) {
      rowLabels.push({
        key: `h:${label}:${y.toFixed(0)}`,
        label,
        left: { x: seatField.minX - pitch, y },
        right: { x: seatField.maxX + pitch, y },
      })
    }
  }

  // ── One number ruler per block, above that block's own front row,
  // however many blocks the room has. The gate is the FRONT ROW's own
  // orientation, never the block's aspect: a narrow three-abreast stalls
  // block is taller than wide yet its rows run horizontally and earn a
  // ruler; a rotated gallery's "row" is a vertical line and does not. ──
  const rulers: RulerMark[] = []
  for (const block of blocks) {
    const rows = new Map<string, number[]>()
    for (const i of block) {
      const list = rows.get(seats[i].row_label)
      if (list) list.push(i)
      else rows.set(seats[i].row_label, [i])
    }
    let frontRow: number[] | null = null
    let frontY = Infinity
    for (const list of rows.values()) {
      const avgY = list.reduce((sum, i) => sum + seats[i].y, 0) / list.length
      if (avgY < frontY) {
        frontY = avgY
        frontRow = list
      }
    }
    if (!frontRow) continue
    const fxs = frontRow.map(i => seats[i].x)
    const fys = frontRow.map(i => seats[i].y)
    if (Math.max(...fxs) - Math.min(...fxs) < Math.max(...fys) - Math.min(...fys)) continue
    for (const i of frontRow) {
      rulers.push({ x: seats[i].x, y: seats[i].y - pitch, text: seats[i].seat_number })
    }
  }

  // Spatial hash for hit tests and culling.
  const cell = Math.max(32, pitch * 2)
  const grid = new Map<string, number[]>()
  seats.forEach((s, i) => {
    const key = cellKey(Math.floor(s.x / cell), Math.floor(s.y / cell))
    const bucket = grid.get(key)
    if (bucket) bucket.push(i)
    else grid.set(key, [i])
  })

  return {
    seats,
    seatColor,
    seatPrice,
    bounds,
    seatField,
    fitBounds,
    blocks,
    pitch,
    chairW,
    polygons,
    rowLabels,
    tableLabels,
    rulers,
    stage,
    stageSpec: stageSpec ?? null,
    areas: input.areas ?? [],
    objects: input.objects ?? [],
    grid,
    cell,
  }
}

/** Seat indices whose cells intersect the world-space viewport. */
export function cullSeats(scene: Scene, view: SceneBounds): number[] {
  const out: number[] = []
  const pad = scene.chairW
  const cx0 = Math.floor((view.minX - pad) / scene.cell)
  const cx1 = Math.floor((view.maxX + pad) / scene.cell)
  const cy0 = Math.floor((view.minY - pad) / scene.cell)
  const cy1 = Math.floor((view.maxY + pad) / scene.cell)
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = scene.grid.get(cellKey(cx, cy))
      if (bucket) out.push(...bucket)
    }
  }
  return out
}

/** The nearest seat within radius of a world point, or null. */
export function hitTestSeat(scene: Scene, wx: number, wy: number, radius: number): number | null {
  const r = Math.max(radius, scene.chairW * 0.7)
  const cx0 = Math.floor((wx - r) / scene.cell)
  const cx1 = Math.floor((wx + r) / scene.cell)
  const cy0 = Math.floor((wy - r) / scene.cell)
  const cy1 = Math.floor((wy + r) / scene.cell)
  let best: number | null = null
  let bestD = r
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = scene.grid.get(cellKey(cx, cy))
      if (!bucket) continue
      for (const i of bucket) {
        const d = Math.hypot(scene.seats[i].x - wx, scene.seats[i].y - wy)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
    }
  }
  return best
}
