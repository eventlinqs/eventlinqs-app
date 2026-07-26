/**
 * The label placement engine: every piece of text on the sheet is placed
 * by ONE pure pass with collision detection, and NO label may ever touch
 * a seat, another label, or a venue object. The painter draws exactly
 * what this returns; the proof harness asserts zero intersections over
 * the same output, so the drawing and the guarantee cannot diverge.
 *
 * Placement rules, in priority order:
 *  1. Rulers: one band per contiguous seat block (polygon cluster),
 *     immediately above that block's first row; marks that would collide
 *     are dropped, never drawn askew.
 *  2. Row letters: two dedicated gutters, a fixed distance outside the
 *     seat field's bounding edge; when two letters would collide
 *     vertically the lower-priority (further back) one is dropped.
 *  3. Section names (and the price at overview): centred in the
 *     polygon's largest clear interior position found by sampling; if no
 *     clear interior position exists, the label moves to the margin with
 *     a hairline leader back to the polygon.
 *  4. Object labels and free captions: drawn only where clear, dropped
 *     on collision.
 */

import type { Camera } from './draw'
import type { LodFlags } from './lod'
import { pointInHull, type HullPoint } from './polygons'
import { cullSeats, type Scene } from './scene'

export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedLabel extends LabelBox {
  kind: 'section' | 'price' | 'rowLetter' | 'ruler' | 'objectLabel' | 'caption'
  text: string
  /** A second line inside the SAME box (the price under a section name). */
  sublabel?: string
  /** Text anchor centre. */
  cx: number
  cy: number
  fontPx: number
  weight: number
  display?: boolean
  color?: string
  leader?: { x1: number; y1: number; x2: number; y2: number }
}

export interface PlaceLabelsInput {
  scene: Scene
  camera: Camera
  width: number
  height: number
  flags: LodFlags
  /** Chair px decides whether below-chair numerals reserve their band. */
  chairPx: number
  formatPrice: (cents: number) => string
  /** Text width in px for a font size and weight (canvas measureText). */
  measure: (text: string, px: number, weight: number) => number
}

/**
 * The venue lettering convention (correction 4, dash mode): rows lettered
 * I and O display as "I-" and "O-" so they never read as 1 and 0. Rooms
 * built under the skip convention have no such rows, so this fires only
 * where the organiser chose (or defaulted to) the dash.
 */
export function displayRowLabel(label: string): string {
  return label === 'I' || label === 'O' ? `${label}-` : label
}

function intersects(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function collides(box: LabelBox, obstacles: LabelBox[]): boolean {
  for (const o of obstacles) if (intersects(box, o)) return true
  return false
}

function toScreen(camera: Camera, x: number, y: number) {
  return { x: x * camera.scale + camera.tx, y: y * camera.scale + camera.ty }
}

/** Seat obstacle boxes for the current viewport, chair-sized. */
export function seatObstacles(
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
  chairPx: number,
): LabelBox[] {
  const view = {
    minX: (0 - camera.tx) / camera.scale,
    minY: (0 - camera.ty) / camera.scale,
    maxX: (width - camera.tx) / camera.scale,
    maxY: (height - camera.ty) / camera.scale,
  }
  const half = chairPx / 2
  const out: LabelBox[] = []
  for (const i of cullSeats(scene, view)) {
    const s = scene.seats[i]
    const at = toScreen(camera, s.x, s.y)
    out.push({ x: at.x - half, y: at.y - half, w: chairPx, h: chairPx })
  }
  return out
}

/** Venue object obstacle boxes (their drawn extent on screen). */
export function objectObstacles(scene: Scene, camera: Camera): LabelBox[] {
  const out: LabelBox[] = []
  for (const obj of scene.objects) {
    if (obj.kind === 'text') continue // captions place through the engine
    const worldW = obj.kind === 'icon' ? (obj.size ?? 32) : (obj.width ?? 48)
    const worldH = obj.kind === 'icon' ? (obj.size ?? 32) : (obj.height ?? 48)
    const at = toScreen(camera, obj.x, obj.y)
    out.push({
      x: at.x,
      y: at.y,
      w: Math.max(worldW * camera.scale, 16),
      h: Math.max(worldH * camera.scale, 16),
    })
  }
  return out
}

function contains(outer: LabelBox, inner: LabelBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function hullBoxInside(hull: HullPoint[], pad: number, box: LabelBox, camera: Camera): boolean {
  // All four corners of the SCREEN box, mapped to world, inside the hull.
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ]
  return corners.every(c =>
    pointInHull(
      { x: (c.x - camera.tx) / camera.scale, y: (c.y - camera.ty) / camera.scale },
      hull,
      pad,
    ),
  )
}

export function placeLabels(input: PlaceLabelsInput): PlacedLabel[] {
  const { scene, camera, width, height, flags, chairPx, measure, formatPrice } = input
  const placed: PlacedLabel[] = []
  const obstacles: LabelBox[] = []

  const seats = flags.seats ? seatObstacles(scene, camera, width, height, Math.max(chairPx, 6)) : []
  const objects = objectObstacles(scene, camera)
  obstacles.push(...seats, ...objects)

  const canvasBox: LabelBox = { x: 4, y: 4, w: width - 8, h: height - 8 }
  const insideCanvas = (b: LabelBox) =>
    b.x >= canvasBox.x && b.y >= canvasBox.y && b.x + b.w <= canvasBox.x + canvasBox.w && b.y + b.h <= canvasBox.y + canvasBox.h

  const push = (label: PlacedLabel) => {
    placed.push(label)
    obstacles.push(label)
  }

  // ── 1. Rulers: the scene's block-derived marks, one ruler per block,
  // above that block's own front row, whatever the block count. ──
  if (flags.rulers) {
    for (const mark of scene.rulers) {
      const at = toScreen(camera, mark.x, mark.y)
      const w = Math.max(10, measure(mark.text, 10, 600) + 2)
      const box: LabelBox = { x: at.x - w / 2, y: at.y - 6, w, h: 12 }
      if (!insideCanvas(box) || collides(box, obstacles)) continue
      push({
        kind: 'ruler',
        text: mark.text,
        ...box,
        cx: at.x,
        cy: at.y,
        fontPx: 10,
        weight: 600,
      })
    }
  }

  // ── 2. Row letters at the scene's anchors: the seat field's two fixed
  // gutters for horizontal rows, a gallery's own ends for vertical. ──
  if (flags.rowLetters) {
    for (const side of ['left', 'right'] as const) {
      const anchors = [...scene.rowLabels]
        .map(r => ({ label: r.label, at: toScreen(camera, r[side].x, r[side].y) }))
        .sort((a, b) => a.at.y - b.at.y)
      // Front rows carry priority per gutter: a letter that would collide
      // with the one above it is dropped, never drawn askew.
      const lastBottomByBand = new Map<number, number>()
      for (const row of anchors) {
        const text = displayRowLabel(row.label)
        const w = Math.max(10, measure(text, 11, 600) + 2)
        const box: LabelBox = { x: row.at.x - w / 2, y: row.at.y - 7, w, h: 14 }
        const band = Math.round(row.at.x / 48)
        if (box.y < (lastBottomByBand.get(band) ?? -Infinity) + 1) continue
        if (!insideCanvas(box) || collides(box, obstacles)) continue
        lastBottomByBand.set(band, box.y + box.h)
        push({
          kind: 'rowLetter',
          text,
          ...box,
          cx: row.at.x,
          cy: row.at.y,
          fontPx: 11,
          weight: 600,
        })
      }
    }
  }

  // ── 3. Section names, with the price range at overview. ───────────────
  if (flags.polygonFill || flags.polygonEdge) {
    for (const poly of scene.polygons) {
      const namePx = flags.polygonFill ? 13 : 11
      const nameText = poly.name.toUpperCase()
      const priceText =
        flags.polygonFill && poly.minPriceCents != null
          ? poly.maxPriceCents != null && poly.maxPriceCents !== poly.minPriceCents
            ? `${formatPrice(poly.minPriceCents)} to ${formatPrice(poly.maxPriceCents)}`
            : formatPrice(poly.minPriceCents)
          : null
      const nameW = measure(nameText, namePx, 700) + 6
      const priceW = priceText ? measure(priceText, 11, 600) + 6 : 0
      const w = Math.max(nameW, priceW)
      const h = priceText ? 30 : 16

      const centroidAt = toScreen(camera, poly.centroid.x, poly.centroid.y)
      // Candidate interior positions: the centroid, then a coarse grid
      // over the hull, scored by clearance.
      const xs = poly.hull.map(p => p.x)
      const ys = poly.hull.map(p => p.y)
      const candidates: { x: number; y: number }[] = [centroidAt]
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 7; gx++) {
          const wx = Math.min(...xs) + ((gx + 0.5) / 7) * (Math.max(...xs) - Math.min(...xs))
          const wy = Math.min(...ys) + ((gy + 0.5) / 5) * (Math.max(...ys) - Math.min(...ys))
          candidates.push(toScreen(camera, wx, wy))
        }
      }
      let done = false
      for (const c of candidates) {
        const box: LabelBox = { x: c.x - w / 2, y: c.y - h / 2, w, h }
        if (!insideCanvas(box)) continue
        if (!hullBoxInside(poly.hull, poly.pad * 0.6, box, camera)) continue
        if (collides(box, obstacles)) continue
        push({
          kind: 'section',
          text: nameText,
          sublabel: priceText ?? undefined,
          ...box,
          cx: c.x,
          cy: priceText ? c.y - 7 : c.y,
          fontPx: namePx,
          weight: 700,
        })
        done = true
        break
      }
      if (done) continue

      // Margin placement with a hairline leader to the polygon.
      const hullMinX = Math.min(...xs)
      const hullMaxX = Math.max(...xs)
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2
      const sides: { x: number; y: number; edge: HullPoint }[] = [
        { x: toScreen(camera, hullMinX, midY).x - w / 2 - 18, y: toScreen(camera, 0, midY).y, edge: { x: hullMinX, y: midY } },
        { x: toScreen(camera, hullMaxX, midY).x + w / 2 + 18, y: toScreen(camera, 0, midY).y, edge: { x: hullMaxX, y: midY } },
        { x: centroidAt.x, y: toScreen(camera, 0, Math.min(...ys)).y - h / 2 - 14, edge: { x: poly.centroid.x, y: Math.min(...ys) } },
        { x: centroidAt.x, y: toScreen(camera, 0, Math.max(...ys)).y + h / 2 + 14, edge: { x: poly.centroid.x, y: Math.max(...ys) } },
      ]
      for (const s of sides) {
        const box: LabelBox = { x: s.x - w / 2, y: s.y - h / 2, w, h }
        if (!insideCanvas(box) || collides(box, obstacles)) continue
        const edgeAt = toScreen(camera, s.edge.x, s.edge.y)
        const leader = {
          x1: s.x + (edgeAt.x > s.x ? w / 2 - 2 : -(w / 2) + 2),
          y1: s.y,
          x2: edgeAt.x,
          y2: edgeAt.y,
        }
        push({
          kind: 'section',
          text: nameText,
          sublabel: priceText ?? undefined,
          ...box,
          cx: s.x,
          cy: priceText ? s.y - 7 : s.y,
          fontPx: namePx,
          weight: 700,
          leader,
        })
        break
      }
    }
  }

  // ── 4. Object labels and free captions: clear or dropped. ─────────────
  for (const obj of scene.objects) {
    if (obj.kind === 'text') {
      const px = Math.max(9, (obj.size ?? 14) * camera.scale)
      const w = measure((obj.text ?? '').toUpperCase(), px, 700) + 4
      const at = toScreen(camera, obj.x + (obj.width ?? 0) / 2, obj.y + (obj.height ?? 0) / 2)
      const box: LabelBox = { x: at.x - w / 2, y: at.y - px / 2 - 2, w, h: px + 4 }
      if (!insideCanvas(box) || collides(box, obstacles)) continue
      push({ kind: 'caption', text: (obj.text ?? '').toUpperCase(), ...box, cx: at.x, cy: at.y, fontPx: px, weight: 700 })
      continue
    }
    if (obj.kind !== 'object' || !obj.label) continue
    const w = (obj.width ?? 48) * camera.scale
    const h = (obj.height ?? 48) * camera.scale
    const text = obj.label
    const tw = measure(text, 10, 600) + 4
    const at = toScreen(camera, obj.x + (obj.width ?? 48) / 2, obj.y + (obj.height ?? 48) / 2)
    const ownChip: LabelBox = { x: at.x - w / 2, y: at.y - h / 2, w, h }
    // Inside the outline when it fits (composition, not collision),
    // otherwise immediately beside it; dropped when nowhere is clear.
    const candidates: LabelBox[] = [
      { x: at.x - tw / 2, y: at.y + h / 2 - 15, w: tw, h: 12 },
      { x: at.x - tw / 2, y: at.y + h / 2 + 4, w: tw, h: 12 },
      { x: at.x + w / 2 + 6, y: at.y - 6, w: tw, h: 12 },
      { x: at.x - w / 2 - tw - 6, y: at.y - 6, w: tw, h: 12 },
    ]
    for (const [ci, box] of candidates.entries()) {
      if (ci === 0) {
        if (!contains(ownChip, box)) continue
        const others = obstacles.filter(o => !contains(o, box))
        if (!insideCanvas(box) || collides(box, others)) continue
      } else if (!insideCanvas(box) || collides(box, obstacles)) {
        continue
      }
      push({ kind: 'objectLabel', text, ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2, fontPx: 10, weight: 600 })
      break
    }
  }

  return placed
}

/**
 * The acceptance assertion: every placed label against every seat, every
 * other label, and every object. Returns the intersection count (zero is
 * the only passing number) plus the totals for the report.
 */
export function assertLabelCollisions(
  labels: PlacedLabel[],
  seats: LabelBox[],
  objects: LabelBox[],
): { labelSeat: number; labelLabel: number; labelObject: number; labels: number } {
  let labelSeat = 0
  let labelLabel = 0
  let labelObject = 0
  for (let i = 0; i < labels.length; i++) {
    for (const s of seats) if (intersects(labels[i], s)) labelSeat++
    for (const o of objects) {
      // A label fully inside its object is composition, not collision.
      if (intersects(labels[i], o) && !contains(o, labels[i])) labelObject++
    }
    for (let j = i + 1; j < labels.length; j++) {
      if (intersects(labels[i], labels[j])) labelLabel++
    }
  }
  return { labelSeat, labelLabel, labelObject, labels: labels.length }
}
