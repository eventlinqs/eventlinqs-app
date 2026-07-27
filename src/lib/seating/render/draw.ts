/**
 * The painters: one world-space pass for geometry, one screen-space pass
 * for text and rings, batched by state and hue so five thousand chairs
 * stay inside the frame budget. Browser-only (Canvas 2D); every geometric
 * decision lives in the pure modules beside this one.
 */

import { SEAT_STATE_COLORS } from '../palette'
import {
  chairPaths,
  objectPaths,
  CHAIR_ACCESS_STROKE,
  CHAIR_STROKE,
  GLYPH_BOX,
  OBJECT_BOX,
  type VenueObjectKind,
} from './glyphs'
import { lodFlags } from './lod'
import { objectObstacles, placeLabels, seatObstacles, type LabelBox, type PlacedLabel } from './labels'
import { cullSeats, type Scene, type SceneBounds } from './scene'

export interface Camera {
  scale: number
  tx: number
  ty: number
}

export type SeatVisualState = 'available' | 'taken' | 'selected' | 'dimmed' | 'held'

export interface PaintOptions {
  dpr: number
  width: number
  height: number
  stateFor: (index: number) => SeatVisualState
  hoverIndex?: number | null
  focusIndex?: number | null
  /** Seat ids outlined as one group (a group ticket's block). */
  groupIndices?: number[]
  /** The section whose polygon glows (view-from-seat anchoring). */
  highlightSectionId?: string | null
  formatPrice: (cents: number) => string
  /** Builder extras. */
  trace?: { image: CanvasImageSource; opacity: number; x: number; y: number; width: number; height: number } | null
  gridDots?: boolean
  /** The builder's surface draws free captions; the buyer plan never does. */
  builderInk?: boolean
  /** Extra painters, world space then screen space. */
  paintWorld?: (ctx: CanvasRenderingContext2D, camera: Camera) => void
  paintScreen?: (ctx: CanvasRenderingContext2D, camera: Camera) => void
}

const C = SEAT_STATE_COLORS
const DATA_FONT = 'Manrope, ui-sans-serif, system-ui, sans-serif'
const DISPLAY_FONT = 'Archivo, ui-sans-serif, system-ui, sans-serif'

export function worldToScreen(camera: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x * camera.scale + camera.tx, y: y * camera.scale + camera.ty }
}

export function screenToWorld(camera: Camera, x: number, y: number): { x: number; y: number } {
  return { x: (x - camera.tx) / camera.scale, y: (y - camera.ty) / camera.scale }
}

export function viewBounds(camera: Camera, width: number, height: number): SceneBounds {
  const a = screenToWorld(camera, 0, 0)
  const b = screenToWorld(camera, width, height)
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }
}

/**
 * Fit the camera to the scene with a margin. `bottomReserve` is dead
 * chrome (the key plan and zoom band): the room fits and centres in the
 * space ABOVE it, so nothing ever renders underneath.
 */
export function fitCamera(
  scene: Scene,
  width: number,
  height: number,
  margin = 36,
  bottomReserve = 0,
): Camera {
  const w = scene.bounds.maxX - scene.bounds.minX
  const h = scene.bounds.maxY - scene.bounds.minY
  const availH = height - bottomReserve
  const scale = Math.min((width - margin * 2) / Math.max(1, w), (availH - margin * 2) / Math.max(1, h))
  return {
    scale,
    tx: (width - w * scale) / 2 - scene.bounds.minX * scale,
    ty: (availH - h * scale) / 2 - scene.bounds.minY * scale,
  }
}

function hullPath(hull: { x: number; y: number }[]): Path2D {
  const p = new Path2D()
  hull.forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)))
  p.closePath()
  return p
}

/** Scaled chair Path2Ds centred on the origin, cached per chair width. */
const chairWorldCache = new Map<
  number,
  Record<'back' | 'pan' | 'armLeft' | 'armRight' | 'access', Path2D>
>()

function chairWorldPaths(chairW: number) {
  const key = Math.round(chairW * 100)
  let paths = chairWorldCache.get(key)
  if (!paths) {
    const k = chairW / GLYPH_BOX
    const half = (GLYPH_BOX / 2) * k
    const m = new DOMMatrix([k, 0, 0, k, -half, -half])
    const src = chairPaths()
    const scaled = (p: Path2D) => {
      const out = new Path2D()
      out.addPath(p, m)
      return out
    }
    paths = {
      back: scaled(src.back),
      pan: scaled(src.pan),
      armLeft: scaled(src.armLeft),
      armRight: scaled(src.armRight),
      access: scaled(src.access),
    }
    chairWorldCache.set(key, paths)
  }
  return paths
}

/** Flat blend of `top` over `under` at alpha t: tints with no halo. */
function hexBlend(top: string, under: string, t: number): string {
  const c = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [tr, tg, tb] = c(top)
  const [ur, ug, ub] = c(under)
  const mix = (a: number, b: number) => Math.round(a * t + b * (1 - t))
  return `#${[mix(tr, ur), mix(tg, ug), mix(tb, ub)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const FLOOR = hexBlend('#FFFFFF', SEAT_STATE_COLORS.veil, 0.55)

// The building shell and the tier-break rules are retired: the restraint
// law puts chairs, row letters, rulers, the stage and the aisles on the
// plan and NOTHING else, and the approved room proof carries neither. At
// small scales the shell's inner wall also collided with the screen-fixed
// flank letters, which the drawn-frame gate caught. The paper canvas is
// the room.

function drawStage(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera) {
  const stage = scene.stage
  if (!stage) return
  const path = stage.ellipse
    ? (() => {
        const p = new Path2D()
        p.ellipse(stage.ellipse.cx, stage.ellipse.cy, stage.ellipse.rx, stage.ellipse.ry, 0, 0, Math.PI * 2)
        return p
      })()
    : hullPath(stage.outline)

  // FLAT paper fill, ink outline, heavier apron line: the benchmark's
  // stage is flat, and flat is what lets the letter-spaced STAGE sit on
  // it with nothing under the text (the drawn-frame gate reads the
  // pixels). The old drafting hatch is retired with the other decoration.
  ctx.fillStyle = C.veil
  ctx.fill(path)
  ctx.strokeStyle = C.night
  ctx.lineWidth = 1.5 / camera.scale
  ctx.stroke(path)
  ctx.beginPath()
  stage.apron.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.lineWidth = 2.5 / camera.scale
  ctx.stroke()
}

function drawAreas(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera) {
  for (const area of scene.areas) {
    const scenery = area.style === 'scenery'
    ctx.save()
    ctx.beginPath()
    const r = 10
    ctx.roundRect(area.x, area.y, area.width, area.height, r)
    ctx.fillStyle = scenery ? 'rgba(10, 22, 40, 0.06)' : `${area.color}22`
    ctx.fill()
    ctx.strokeStyle = scenery ? 'rgba(10, 22, 40, 0.35)' : area.color
    ctx.lineWidth = 1.5 / camera.scale
    if (!scenery) ctx.setLineDash([6 / camera.scale, 4 / camera.scale])
    ctx.stroke()
    ctx.restore()
  }
}

function drawSeats(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, opts: PaintOptions) {
  const chairPx = scene.chairW * camera.scale
  const flags = lodFlags(camera.scale, chairPx)
  if (!flags.seats) return
  const paths = chairWorldPaths(scene.chairW)
  const visible = cullSeats(scene, viewBounds(camera, opts.width, opts.height))

  // Batch: state and hue decide style; draw each batch with one style setup.
  const batches = new Map<string, number[]>()
  for (const i of visible) {
    const state = opts.stateFor(i)
    const key = state === 'available' || state === 'dimmed' ? `${state}|${scene.seatColor[i]}` : state
    const list = batches.get(key)
    if (list) list.push(i)
    else batches.set(key, [i])
  }

  // The stroke SCALES WITH THE GLYPH (founder specification): one silhouette
  // uniformly scaled, so its outline keeps the same proportion at every size
  // rather than fattening relative to the chair as the map zooms out. World
  // units, so it is drawn under the camera transform like the paths.
  const outlineW = (scene.chairW / GLYPH_BOX) * CHAIR_STROKE
  const keylineW = outlineW * 1.15
  const dash = [outlineW * 2.2, outlineW * 1.8]

  // ONE glyph. Every part every time: there are no tiers to branch on.
  const bodyParts = (draw: (p: Path2D) => void) => {
    draw(paths.back)
    draw(paths.armLeft)
    draw(paths.armRight)
    draw(paths.pan)
  }
  const keyParts = bodyParts

  for (const [key, indices] of batches) {
    const [state, hue] = key.split('|') as [SeatVisualState, string | undefined]
    ctx.save()
    if (state === 'dimmed') ctx.globalAlpha = 0.22
    let lastX = 0
    let lastY = 0
    for (const i of indices) {
      const s = scene.seats[i]
      ctx.translate(s.x - lastX, s.y - lastY)
      lastX = s.x
      lastY = s.y
      if (state === 'selected') {
        // Solid gold with the ink keyline.
        ctx.fillStyle = C.gold
        bodyParts(p => ctx.fill(p))
        ctx.strokeStyle = C.night
        ctx.lineWidth = keylineW
        keyParts(p => ctx.stroke(p))
      } else if (state === 'taken') {
        // SOLID DARK, no stroke, no numeral: the benchmark's high-contrast
        // sold state does most of the visual work on the plan.
        ctx.fillStyle = C.dusk
        bodyParts(p => ctx.fill(p))
      } else if (state === 'held') {
        // Stone body with the dashed tier-hue stroke.
        ctx.fillStyle = C.stone
        bodyParts(p => ctx.fill(p))
        ctx.strokeStyle = hue ?? C.dusk
        ctx.lineWidth = outlineW
        ctx.setLineDash(dash)
        keyParts(p => ctx.stroke(p))
        ctx.setLineDash([])
      } else {
        // AVAILABLE: outline in the tier hue over paper, never a solid
        // mass: the anatomy the benchmark breathes through.
        ctx.fillStyle = C.white
        bodyParts(p => ctx.fill(p))
        ctx.strokeStyle = hue ?? C.dusk
        ctx.lineWidth = outlineW
        bodyParts(p => ctx.stroke(p))
        if (s.seat_type === 'accessible') {
          ctx.lineWidth = (scene.chairW / GLYPH_BOX) * CHAIR_ACCESS_STROKE
          ctx.lineCap = 'round'
          ctx.stroke(paths.access)
        }
      }
    }
    ctx.restore()
  }
}

/** Screen-space text and rings: the stage label, area labels, cursors. */
function drawScreenPass(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, opts: PaintOptions) {
  const flags = lodFlags(camera.scale, scene.chairW * camera.scale)

  // Section polygons: filled cards whenever the plan is NOT drawing chairs,
  // which is overview and any width where the chair falls below the
  // legibility floor. Never a grid of abstract marks on a buyer's map.
  if (flags.polygonFill) {
    for (const poly of scene.polygons) {
      const path = hullPath(poly.hull)
      ctx.save()
      ctx.setTransform(opts.dpr * camera.scale, 0, 0, opts.dpr * camera.scale, opts.dpr * camera.tx, opts.dpr * camera.ty)
      const pad = poly.pad
      // A drafted plan, not a card stack: the padded wedge paints in ONE
      // flat tint (hue pre-blended over the floor) so no alpha halo can
      // read as a drop shadow; depth is carried by line weight alone.
      const tint = hexBlend(poly.color, FLOOR, 0.24)
      ctx.lineJoin = 'round'
      ctx.lineWidth = pad * 2
      ctx.strokeStyle = tint
      ctx.stroke(path)
      ctx.fillStyle = tint
      ctx.fill(path)
      ctx.lineWidth = 1 / camera.scale
      ctx.strokeStyle = poly.color
      ctx.stroke(path)
      if (opts.highlightSectionId === poly.sectionId) {
        ctx.setLineDash([])
        ctx.lineWidth = 2.5 / camera.scale
        ctx.strokeStyle = C.gold
        ctx.lineJoin = 'round'
        ctx.stroke(path)
      }
      ctx.restore()
      // Names and prices are placed by the label engine, never here.
    }
  } else if (opts.highlightSectionId) {
    for (const poly of scene.polygons) {
      if (poly.sectionId !== opts.highlightSectionId) continue
      ctx.save()
      ctx.setTransform(opts.dpr * camera.scale, 0, 0, opts.dpr * camera.scale, opts.dpr * camera.tx, opts.dpr * camera.ty)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.5 / camera.scale
      ctx.strokeStyle = C.gold
      ctx.stroke(hullPath(poly.hull))
      ctx.restore()
    }
  }

  // Stage label: small caps in the apron, never a bar, and ONLY when the
  // drawn stage is tall enough to hold the text clear of its own outline
  // and apron: at a far-out fit the stage is a shape, not a label holder,
  // and text riding its linework is a drawn collision.
  // THE STAGE ALWAYS CARRIES ITS CAPTION. A short stage used to lose it
  // entirely (the old gate dropped the text below 26px of drawn height),
  // which left a blank rectangle a buyer cannot identify: at 390 that is the
  // normal case, not the exception. The caption now sizes itself to the
  // stage, and when the stage is too shallow to hold text inside its own
  // outline the caption sits just above it instead of vanishing.
  if (scene.stage) {
    const stageYs = scene.stage.outline.map(p => p.y)
    const stageScreenH = (Math.max(...stageYs) - Math.min(...stageYs)) * camera.scale
    const at = worldToScreen(camera, scene.stage.labelAt.x, scene.stage.labelAt.y)
    const fontPx = stageScreenH >= 26 ? 10 : stageScreenH >= 16 ? 9 : 8
    const spacing = fontPx >= 10 ? 3 : 2
    // Inside the stage when it can hold the text clear of its own linework,
    // otherwise lifted just above the apron.
    const insideStage = stageScreenH >= fontPx + 10
    const y = insideStage ? at.y : Math.min(...stageYs) * camera.scale + camera.ty - 6
    const halfW = 26 + spacing * 2.5
    const onCanvas =
      at.x - halfW >= 4 && at.x + halfW <= opts.width - 4 && y - fontPx >= 4 && y + 4 <= opts.height - 4
    if (onCanvas) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.font = `600 ${fontPx}px ${DATA_FONT}`
      ctx.fillStyle = C.dusk
      ctx.letterSpacing = `${spacing}px`
      ctx.fillText('STAGE', at.x, y)
      ctx.restore()
    }
  }

  // Area labels: ALWAYS. A zone holds no seats, so unlike a seated section
  // it has no other identity on the plan: unlabelled it is simply a blank
  // rectangle. The restraint law lists what the SEAT field carries; a
  // general admission zone naming itself is not decoration.
  {
    for (const area of scene.areas) {
      const at = worldToScreen(camera, area.x + area.width / 2, area.y + area.height / 2)
      if (at.x < -100 || at.x > opts.width + 100 || at.y < -30 || at.y > opts.height + 30) continue
      ctx.save()
      ctx.textAlign = 'center'
      ctx.font = `700 12px ${DISPLAY_FONT}`
      ctx.fillStyle = C.night
      ctx.fillText(area.label, at.x, at.y + (area.style === 'scenery' ? 4 : -2))
      if (area.style !== 'scenery' && area.label.trim().toLowerCase() !== 'general admission') {
        ctx.font = `500 10px ${DATA_FONT}`
        ctx.fillStyle = C.dusk
        ctx.fillText('General admission', at.x, at.y + 12)
      }
      ctx.restore()
    }
  }

  // Row letters and rulers are placed by the label engine, never here.
  // Per-seat numerals are OFF the plan entirely (the restraint law lists
  // chairs, letters, rulers, stage and aisles, nothing else): at standard
  // pitch a below-chair numeral must collide with the next row, and the
  // ruler, the flank letters and the tooltip carry seat identity, the way
  // the benchmark does.

  // The group outline: one gold bound around a group ticket's block.
  if (opts.groupIndices && opts.groupIndices.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const i of opts.groupIndices) {
      const s = scene.seats[i]
      minX = Math.min(minX, s.x)
      minY = Math.min(minY, s.y)
      maxX = Math.max(maxX, s.x)
      maxY = Math.max(maxY, s.y)
    }
    const a = worldToScreen(camera, minX, minY)
    const b = worldToScreen(camera, maxX, maxY)
    const pad = scene.chairW * camera.scale * 0.75
    ctx.save()
    ctx.strokeStyle = C.gold
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(a.x - pad, a.y - pad, b.x - a.x + pad * 2, b.y - a.y + pad * 2)
    ctx.restore()
  }

  // Hover ring, then the keyboard cursor's double ring.
  const ring = (index: number, style: 'hover' | 'focus') => {
    const s = scene.seats[index]
    const at = worldToScreen(camera, s.x, s.y)
    const r = Math.max(7, scene.chairW * camera.scale * 0.68)
    ctx.save()
    if (style === 'focus') {
      ctx.strokeStyle = C.night
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.arc(at.x, at.y, r + 2, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = style === 'focus' ? C.bloom : C.gold
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(at.x, at.y, r + 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  if (opts.hoverIndex != null && opts.hoverIndex >= 0) ring(opts.hoverIndex, 'hover')
  if (opts.focusIndex != null && opts.focusIndex >= 0) ring(opts.focusIndex, 'focus')
}

function drawObjects(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, opts: PaintOptions) {
  for (const obj of scene.objects) {
    const w = obj.width ?? 48
    const h = obj.height ?? 48
    ctx.save()
    ctx.setTransform(opts.dpr * camera.scale, 0, 0, opts.dpr * camera.scale, opts.dpr * camera.tx, opts.dpr * camera.ty)
    ctx.translate(obj.x + w / 2, obj.y + h / 2)
    if (obj.rotation) ctx.rotate((obj.rotation * Math.PI) / 180)

    if (obj.kind === 'text') {
      // Captions place through the label engine, never here.
      ctx.restore()
      continue
    }

    const kind = (obj.object ?? 'bar') as VenueObjectKind
    if (obj.kind === 'object') {
      // Room furniture as an architectural hairline outline over flat
      // paper: no hatch, no chip, just linework in the negative space.
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h / 2, w, h, 1.5)
      ctx.fillStyle = C.veil
      ctx.fill()
      ctx.strokeStyle = 'rgba(10, 22, 40, 0.6)'
      ctx.lineWidth = 1 / camera.scale
      ctx.stroke()
    }
    // The glyph, centred, at 55% of the chip's smaller side. Venue objects
    // keep their own 24-box; only the chair moved to the 100-box.
    const g = Math.min(w, h) * (obj.kind === 'icon' ? 0.9 : 0.5)
    const k = g / OBJECT_BOX
    ctx.translate(-g / 2, obj.kind === 'object' ? -g / 2 - h * 0.08 : -g / 2)
    ctx.scale(k, k)
    ctx.strokeStyle = C.night
    ctx.lineWidth = 1.6 / (camera.scale * k)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const p of objectPaths(kind)) ctx.stroke(p)
    ctx.restore()

    // Object labels place through the label engine, never here.
  }
}

export interface PaintResult {
  labels: PlacedLabel[]
  seatBoxes: LabelBox[]
  objectBoxes: LabelBox[]
}

/** The full frame: clears, paints world geometry, then the screen pass,
 *  then every label the placement engine cleared. Returns the placed
 *  labels and obstacle boxes so the proof harness asserts the SAME data
 *  the frame drew. */
export function paintScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  opts: PaintOptions,
): PaintResult {
  const { dpr, width, height } = opts
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = C.veil
  ctx.fillRect(0, 0, width, height)
  // Everything paints inside the sheet frame: nothing bleeds to the edge.
  ctx.save()
  ctx.beginPath()
  ctx.rect(3, 3, width - 6, height - 6)
  ctx.clip()

  if (opts.trace) {
    ctx.save()
    ctx.globalAlpha = opts.trace.opacity
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.tx, dpr * camera.ty)
    ctx.drawImage(opts.trace.image, opts.trace.x, opts.trace.y, opts.trace.width, opts.trace.height)
    ctx.restore()
  }

  if (opts.gridDots) {
    // Drafting dots at one pitch, drawn only inside the viewport.
    const view = viewBounds(camera, width, height)
    const step = scene.pitch
    ctx.save()
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.tx, dpr * camera.ty)
    ctx.fillStyle = 'rgba(10, 22, 40, 0.07)'
    const r = 1.1 / camera.scale
    const x0 = Math.floor(view.minX / step) * step
    const y0 = Math.floor(view.minY / step) * step
    if ((view.maxX - x0) / step < 300 && (view.maxY - y0) / step < 300) {
      for (let x = x0; x <= view.maxX; x += step) {
        for (let y = y0; y <= view.maxY; y += step) {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  // World pass: the stage first, then everything else on the paper.
  ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.tx, dpr * camera.ty)
  drawStage(ctx, scene, camera)
  drawAreas(ctx, scene, camera)
  drawSeats(ctx, scene, camera, opts)
  opts.paintWorld?.(ctx, camera)

  // Objects manage their own transforms (rotation, chips, labels).
  drawObjects(ctx, scene, camera, opts)

  // Screen pass.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawScreenPass(ctx, scene, camera, opts)
  opts.paintScreen?.(ctx, camera)

  // The label engine: one pure pass places every piece of text; the frame
  // draws exactly its output.
  const chairPx = scene.chairW * camera.scale
  const flags = lodFlags(camera.scale, chairPx)
  const labels = placeLabels({
    scene,
    camera,
    width: opts.width,
    height: opts.height,
    flags,
    chairPx,
    formatPrice: opts.formatPrice,
    builderInk: opts.builderInk,
    measure: (text, px, weight) => {
      ctx.font = `${weight} ${px}px ${DATA_FONT}`
      return ctx.measureText(text).width
    },
  })
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const label of labels) {
    const font =
      label.kind === 'section' || label.kind === 'caption' || label.kind === 'table'
        ? DISPLAY_FONT
        : DATA_FONT
    ctx.font = `${label.weight} ${label.fontPx}px ${font}`
    ctx.fillStyle = label.kind === 'price' || label.kind === 'ruler' || label.kind === 'rowLetter' ? C.dusk : C.night
    ctx.fillText(label.text, label.cx, label.cy)
    if (label.sublabel) {
      // The engine sized this line and reserved the room for it, so the
      // painter must use ITS size, not a fixed 11px that can overflow the
      // box the collision gate measured.
      const subPx = label.subFontPx ?? Math.max(8, label.fontPx - 2)
      ctx.font = `600 ${subPx}px ${DATA_FONT}`
      ctx.fillStyle = C.dusk
      ctx.fillText(label.sublabel, label.cx, label.cy + (label.fontPx + subPx) / 2 + 2)
    }
  }
  ctx.restore()
  ctx.restore() // the sheet-frame clip

  return {
    labels,
    seatBoxes: flags.seats ? seatObstacles(scene, camera, opts.width, opts.height, Math.max(chairPx, 6)) : [],
    objectBoxes: objectObstacles(scene, camera),
  }
}

/** The key plan: polygons, stage and the one gold viewport rectangle. */
export function paintMiniMap(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  opts: { dpr: number; width: number; height: number; viewWidth: number; viewHeight: number },
) {
  const { dpr, width, height } = opts
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = C.white
  ctx.fillRect(0, 0, width, height)

  const mini = fitCamera(scene, width, height, 8)
  ctx.setTransform(dpr * mini.scale, 0, 0, dpr * mini.scale, dpr * mini.tx, dpr * mini.ty)

  // A true miniature of the plan: the same wedges and the same stage
  // geometry, not abstract rectangles.
  if (scene.stage) {
    const path = scene.stage.ellipse
      ? (() => {
          const p = new Path2D()
          p.ellipse(
            scene.stage.ellipse.cx,
            scene.stage.ellipse.cy,
            scene.stage.ellipse.rx,
            scene.stage.ellipse.ry,
            0,
            0,
            Math.PI * 2,
          )
          return p
        })()
      : hullPath(scene.stage.outline)
    ctx.fillStyle = 'rgba(10, 22, 40, 0.14)'
    ctx.fill(path)
    ctx.strokeStyle = 'rgba(10, 22, 40, 0.5)'
    ctx.lineWidth = 1 / mini.scale
    ctx.stroke(path)
  }
  for (const poly of scene.polygons) {
    const path = hullPath(poly.hull)
    const tint = hexBlend(poly.color, FLOOR, 0.3)
    ctx.lineJoin = 'round'
    ctx.lineWidth = poly.pad * 2
    ctx.strokeStyle = tint
    ctx.stroke(path)
    ctx.fillStyle = tint
    ctx.fill(path)
    ctx.lineWidth = 0.75 / mini.scale
    ctx.strokeStyle = poly.color
    ctx.stroke(path)
  }
  if (scene.polygons.length === 0) {
    // Sectionless rooms: the seat field as soft dots.
    ctx.fillStyle = 'rgba(10, 22, 40, 0.30)'
    for (const s of scene.seats) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, scene.pitch * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (const area of scene.areas) {
    ctx.fillStyle = hexBlend(area.color, FLOOR, 0.2)
    ctx.fillRect(area.x, area.y, area.width, area.height)
  }

  // The buyer's viewport: the only gold on the key plan.
  const a = screenToWorld(camera, 0, 0)
  const b = screenToWorld(camera, opts.viewWidth, opts.viewHeight)
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 1.5 / mini.scale
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = 'rgba(10, 22, 40, 0.25)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
}

/** The mini camera used by the key plan, exposed for its pointer mapping. */
export function miniMapCamera(scene: Scene, width: number, height: number): Camera {
  return fitCamera(scene, width, height, 8)
}
