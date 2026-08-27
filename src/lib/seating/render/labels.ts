/**
 * The label placement engine: every piece of text on the sheet is placed
 * by ONE pure pass with collision detection, and NO label may ever touch
 * a seat, another label, or a venue object. The painter draws exactly
 * what this returns; the proof harness asserts zero intersections over
 * the same output, so the drawing and the guarantee cannot diverge.
 *
 * Placement rules, in priority order (the restraint law: ON the plan at
 * every zoom sit chairs, row letters, rulers, the stage and the aisles,
 * NOTHING else; section names and prices exist at overview only, inside
 * their polygon, and vanish at mid and seat):
 *  1. Rulers: one band per contiguous seat block, immediately above that
 *     block's own front row; marks that would collide are dropped, never
 *     drawn askew.
 *  2. Row letters: the seat field's two fixed gutters (galleries at
 *     their own ends); a letter that would collide is dropped.
 *  3. Section names with the price range: OVERVIEW ONLY, centred in the
 *     polygon's largest clear interior position found by sampling; if no
 *     clear interior position exists the label is DROPPED. No leader
 *     lines, ever: prices otherwise live in the ticket rail.
 *  4. Free captions: the BUILDER's surface only, never the buyer plan.
 *     Object labels do not exist; a venue object is its hairline outline.
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
  kind: 'section' | 'price' | 'rowLetter' | 'ruler' | 'caption' | 'table'
  text: string
  /** A second line inside the SAME box (the price under a section name). */
  sublabel?: string
  /** Text anchor centre. */
  cx: number
  cy: number
  fontPx: number
  /** Font size for the sublabel line; defaults to fontPx - 2. */
  subFontPx?: number
  weight: number
  display?: boolean
  color?: string
}

export interface PlaceLabelsInput {
  scene: Scene
  camera: Camera
  width: number
  height: number
  flags: LodFlags
  /** The chair's on-screen size: sizes the seat obstacle boxes. */
  chairPx: number
  formatPrice: (cents: number) => string
  /** Text width in px for a font size and weight (canvas measureText). */
  measure: (text: string, px: number, weight: number) => number
  /**
   * The builder's surface places free captions; the buyer plan never
   * does (the restraint law). Default false.
   */
  builderInk?: boolean
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

/**
 * The stage's drawn extent on screen. The restraint law keeps the stage ON
 * the plan at every zoom, so it is ink like any other and no ruler, row
 * letter or section name may sit on it. Its own letter-spaced STAGE caption
 * is painted by the world pass inside the flat fill, with nothing under it,
 * so it is not placed through this engine and does not self-collide.
 *
 * Without this the mobile mid-zoom rulers landed on the stage outline: the
 * marks anchor one pitch above their block's front row, and on a room whose
 * front row sits close under the apron that anchor is on the stage. The
 * model never saw it (a stage is not a seat and not an object), which is
 * exactly why the gate reads the drawn frame instead.
 */
export function stageObstacles(scene: Scene, camera: Camera): LabelBox[] {
  const stage = scene.stage
  if (!stage) return []
  const pts = [...stage.outline, ...stage.apron]
  if (pts.length === 0) return []
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const tl = toScreen(camera, Math.min(...xs), Math.min(...ys))
  const br = toScreen(camera, Math.max(...xs), Math.max(...ys))
  return [{ x: tl.x, y: tl.y, w: Math.max(br.x - tl.x, 1), h: Math.max(br.y - tl.y, 1) }]
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
  const stage = stageObstacles(scene, camera)
  obstacles.push(...seats, ...objects, ...stage)

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

  // ── 3. Section names with the price range: OVERVIEW ONLY, inside the
  // polygon or not at all. No leader lines, no margin placement: a name
  // that cannot sit clear inside its own polygon is dropped, and the
  // ticket rail carries the prices. ──
  if (flags.polygonFill) {
    // Screen-space boxes of every polygon's drawn extent (hull plus its pad).
    // A label that cannot fit inside its own polygon is placed on CLEAR PAPER
    // beside it, never straddling an outline: text crossing a polygon edge is
    // what the drawn-frame gate reports as ink under the glyphs, and it is
    // genuinely hard to read.
    const polyBoxes: LabelBox[] = scene.polygons.map(p => {
      const xs = p.hull.map(h => h.x)
      const ys = p.hull.map(h => h.y)
      const tl = toScreen(camera, Math.min(...xs), Math.min(...ys))
      const br = toScreen(camera, Math.max(...xs), Math.max(...ys))
      // 0.55 of the pad, not all of it: the drawn tint fades through that
      // band, and reserving the full pad closed the gaps between adjacent
      // tables so tightly that a label could find no clear paper at all. The
      // drawn-frame gate is the arbiter of whether text lands on ink.
      const pad = p.pad * camera.scale * 0.55
      return { x: tl.x - pad, y: tl.y - pad, w: br.x - tl.x + pad * 2, h: br.y - tl.y + pad * 2 }
    })

    for (const poly of scene.polygons) {
      const nameText = poly.name.toUpperCase()
      const priceText =
        poly.minPriceCents != null
          ? poly.maxPriceCents != null && poly.maxPriceCents !== poly.minPriceCents
            ? `${formatPrice(poly.minPriceCents)} to ${formatPrice(poly.maxPriceCents)}`
            : formatPrice(poly.minPriceCents)
          : null

      const centroidAt = toScreen(camera, poly.centroid.x, poly.centroid.y)
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

      // EVERY POLYGON CARRIES ITS NAME AND PRICE. A single fixed size meant
      // a narrow band on a 390 viewport simply lost both, which is a
      // failure, not a restraint. So the size steps down until the pair
      // fits inside the polygon; only if even the smallest will not fit does
      // the price drop, and the name alone then steps down again.
      const SIZES = [13, 11.5, 10, 9, 8]
      const OUTSIDE_SIZES = [10, 9, 8, 7]
      let done = false
      // Pass 1 keeps the label wholly INSIDE its polygon, which is the ideal.
      // Pass 2 puts it on the clear paper immediately outside the polygon,
      // touching no polygon at all. Pass 2 exists because a small polygon (a
      // cabaret table at 390 is about 40px across) can never contain its own
      // name at any legible size, and an anonymous blob is worse than a label
      // sitting just beneath its table. NO POLYGON GOES UNNAMED.
      const own = polyBoxes[scene.polygons.indexOf(poly)]
      // PRICE FIRST. The name and the price are one unit: a polygon labelled
      // with a bare name is still an unpriced blob, so every placement and
      // every size is tried WITH the price before the price is given up.
      // `capped` keeps a label no wider than its own polygon, which is what
      // stops one small polygon starving its neighbours. It is a PREFERENCE,
      // not a rule: everything is tried capped first, then uncapped, because a
      // long name on a tiny polygon must still be drawn rather than dropped.
      // The price is only given up when it cannot be drawn at all. Stacked is
      // the ideal; INLINE is the fallback for a polygon whose only clear paper
      // is a single-line gap (a middle row of cabaret tables has about 33px
      // between its neighbours, which fits one line and not two); name alone
      // is the last resort.
      const MODES: ('stacked' | 'inline' | 'nameOnly')[] = priceText
        ? ['stacked', 'inline', 'nameOnly']
        : ['nameOnly']
      for (const capped of [true, false]) {
      for (const mode of MODES) {
        const withPrice = mode === 'stacked'
        // Three placements, in order of preference:
        //   hull  - wholly inside the polygon's own seat hull (the ideal)
        //   paper - on the clear paper just outside it, touching no polygon
        //   tint  - on the polygon's own flat fill, inside its drawn box and
        //           clear of every other polygon. This is how the large
        //           four-tier labels already sit; for a small table it is the
        //           only place a name AND price can both be drawn when the
        //           neighbouring rows leave no paper free.
        for (const place of ['hull', 'paper', 'tint'] as const) {
          const _mustFitInside = place === 'hull'
          // A label placed OUTSIDE its polygon stays compact. A 13px label on
          // the paper beside a small table is wider than the table itself and
          // physically blocks the paper its neighbours need, which is what
          // left half a row of identical tables anonymous. Inside its own
          // polygon a label may still take the full ladder.
          for (const namePx of place === 'hull' ? SIZES : OUTSIDE_SIZES) {
            const pricePx = Math.max(8, namePx - 2)
            const drawnText = mode === 'inline' ? `${nameText} ${priceText}` : nameText
            const nameW = measure(drawnText, namePx, 700) + 6
            const priceW = withPrice ? measure(priceText!, pricePx, 600) + 6 : 0
            const w = Math.max(nameW, priceW)
            const h = withPrice ? namePx + pricePx + 6 : namePx + 3
            // A label is capped to its own polygon's width (plus a little).
            // Without this the first small polygon greedily took a 13px label
            // wider than itself and physically starved its neighbours of the
            // paper they needed, so a row of equal tables ended up with two
            // labelled and two anonymous. Sizing each label to its own shape
            // keeps the row consistent and leaves room for every one of them.
            if (capped && place === 'paper' && own && w > Math.max(own.w * 1.15, 56)) continue
            // Inside: the centroid then a grid over the hull. Outside: the
            // clear paper directly under the polygon, then directly over it.
            const cx0 = own ? own.x + own.w / 2 : 0
            const cy0 = own ? own.y + own.h / 2 : 0
            const spots =
              place === 'hull'
                ? candidates
                : place === 'tint'
                  ? own
                    ? [{ x: cx0, y: cy0 }]
                    : []
                  : own
                    ? [
                        { x: cx0, y: own.y + own.h + h / 2 + 3 },
                        { x: cx0, y: own.y - h / 2 - 3 },
                        { x: own.x + own.w + w / 2 + 3, y: cy0 },
                        { x: own.x - w / 2 - 3, y: cy0 },
                      ]
                    : []
            for (const c of spots) {
              const box: LabelBox = { x: c.x - w / 2, y: c.y - h / 2, w, h }
              if (!insideCanvas(box)) continue
              if (place === 'hull' && !hullBoxInside(poly.hull, poly.pad * 0.6, box, camera)) continue
              if (place === 'paper' && polyBoxes.some(pb => intersects(box, pb))) continue
              if (place === 'tint') {
                // Wholly on its OWN fill, and touching no other polygon.
                if (!own || !contains(own, box)) continue
                if (polyBoxes.some(pb => pb !== own && intersects(box, pb))) continue
              }
              if (collides(box, obstacles)) continue
              push({
                kind: 'section',
                text: drawnText,
                sublabel: withPrice ? priceText! : undefined,
                ...box,
                cx: c.x,
                cy: withPrice ? c.y - (pricePx + 2) / 2 : c.y,
                fontPx: namePx,
                subFontPx: withPrice ? pricePx : undefined,
                weight: 700,
              })
              done = true
              break
            }
            if (done) break
          }
          if (done) break
        }
        if (done) break
      }
      if (done) break
      }
    }
  }

  // ── 3b. Table names: one per table, centred in its own ring. Tables sit
  // outside the block system, so this is where they carry their identity.
  // Drawn whenever the chairs are, because a table without its name is an
  // unidentifiable ring of seats. ──
  if (flags.seats) {
    for (const table of scene.tableLabels) {
      const at = toScreen(camera, table.x, table.y)
      const ringPx = table.radius * camera.scale
      // Sized to the table, never larger than the ring can hold.
      for (const px of [12, 11, 10, 9]) {
        const w = measure(table.label, px, 700) + 6
        if (w > ringPx * 1.9) continue
        const box: LabelBox = { x: at.x - w / 2, y: at.y - (px + 4) / 2, w, h: px + 4 }
        if (!insideCanvas(box) || collides(box, obstacles)) continue
        push({
          kind: 'table',
          text: table.label,
          ...box,
          cx: at.x,
          cy: at.y,
          fontPx: px,
          weight: 700,
        })
        break
      }
    }
  }

  // ── 4. Free captions: the builder's surface only, clear or dropped.
  // The buyer plan never carries them, and object labels do not exist. ──
  if (input.builderInk) {
    for (const obj of scene.objects) {
      if (obj.kind !== 'text') continue
      const px = Math.max(9, (obj.size ?? 14) * camera.scale)
      const w = measure((obj.text ?? '').toUpperCase(), px, 700) + 4
      const at = toScreen(camera, obj.x + (obj.width ?? 0) / 2, obj.y + (obj.height ?? 0) / 2)
      const box: LabelBox = { x: at.x - w / 2, y: at.y - px / 2 - 2, w, h: px + 4 }
      if (!insideCanvas(box) || collides(box, obstacles)) continue
      push({ kind: 'caption', text: (obj.text ?? '').toUpperCase(), ...box, cx: at.x, cy: at.y, fontPx: px, weight: 700 })
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
