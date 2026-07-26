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

export interface Scene {
  seats: SceneSeatInput[]
  seatColor: string[]
  seatPrice: (number | null)[]
  bounds: SceneBounds
  /** Median nearest-neighbour distance: the room's seat pitch. */
  pitch: number
  /** The chair's world width, derived from the pitch. */
  chairW: number
  polygons: SectionPolygon[]
  rowLabels: RowLabelAnchor[]
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
  for (const o of input.objects ?? []) {
    bounds.minX = Math.min(bounds.minX, o.x)
    bounds.minY = Math.min(bounds.minY, o.y)
    bounds.maxX = Math.max(bounds.maxX, o.x + (o.width ?? 48))
    bounds.maxY = Math.max(bounds.maxY, o.y + (o.height ?? 48))
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
    const pts = indices.map(i => ({ x: seats[i].x, y: seats[i].y }))
    const hull = convexHull(pts)
    const prices = indices.map(i => seatPrice[i]).filter((p): p is number => p != null)
    // Dominant tier hue: the most common resolved seat colour in the section.
    const hueCount = new Map<string, number>()
    for (const i of indices) hueCount.set(seatColor[i], (hueCount.get(seatColor[i]) ?? 0) + 1)
    const dominant = [...hueCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? section.color
    polygons.push({
      sectionId,
      name: section.name,
      hull,
      centroid: polygonCentroid(hull),
      pad: pitch,
      minPriceCents: prices.length ? Math.min(...prices) : null,
      maxPriceCents: prices.length ? Math.max(...prices) : null,
      color: dominant,
    })
  }

  // Row labels: per section + row, anchored one pitch outside each flank.
  const rowGroups = new Map<string, { label: string; indices: number[] }>()
  seats.forEach((s, i) => {
    const key = `${s.seat_map_section_id ?? 'none'}::${s.row_label}`
    const g = rowGroups.get(key)
    if (g) g.indices.push(i)
    else rowGroups.set(key, { label: s.row_label, indices: [i] })
  })
  const rowLabels: RowLabelAnchor[] = []
  for (const [key, group] of rowGroups) {
    // Tables label through their own geometry, not the flanks.
    if (/table|booth/i.test(group.label)) continue
    let leftIdx = group.indices[0]
    let rightIdx = group.indices[0]
    for (const i of group.indices) {
      if (seats[i].x < seats[leftIdx].x) leftIdx = i
      if (seats[i].x > seats[rightIdx].x) rightIdx = i
    }
    rowLabels.push({
      key,
      label: group.label,
      left: { x: seats[leftIdx].x - pitch, y: seats[leftIdx].y },
      right: { x: seats[rightIdx].x + pitch, y: seats[rightIdx].y },
    })
  }

  // The seat-number ruler: the front row of each section, numbers set one
  // pitch above each seat of that row (curved rows keep their own x).
  const rulers: RulerMark[] = []
  for (const [sectionId, indices] of bySection) {
    const rows = new Map<string, number[]>()
    for (const i of indices) {
      const label = seats[i].row_label
      if (/table|booth/i.test(label)) continue
      const list = rows.get(label)
      if (list) list.push(i)
      else rows.set(label, [i])
    }
    let frontRow: number[] | null = null
    let frontY = Infinity
    for (const list of rows.values()) {
      const avgY = list.reduce((s, i) => s + seats[i].y, 0) / list.length
      if (avgY < frontY) {
        frontY = avgY
        frontRow = list
      }
    }
    if (!frontRow) continue
    for (const i of frontRow) {
      rulers.push({ x: seats[i].x, y: seats[i].y - pitch, text: seats[i].seat_number })
    }
    void sectionId
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
    pitch,
    chairW,
    polygons,
    rowLabels,
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
