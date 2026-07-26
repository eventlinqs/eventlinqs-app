/**
 * The painters: one world-space pass for geometry, one screen-space pass
 * for text and rings, batched by state and hue so five thousand chairs
 * stay inside the frame budget. Browser-only (Canvas 2D); every geometric
 * decision lives in the pure modules beside this one.
 */

import { SEAT_STATE_COLORS } from '../palette'
import { chairPaths, objectPaths, OBJECT_GLYPHS, GLYPH_BOX, type VenueObjectKind } from './glyphs'
import { glyphTier, lodFlags, NUMERAL_CHAIR_PX, type GlyphTier } from './lod'
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

/** Fit the camera to the scene with a margin, returning the fit scale. */
export function fitCamera(scene: Scene, width: number, height: number, margin = 36): Camera {
  const w = scene.bounds.maxX - scene.bounds.minX
  const h = scene.bounds.maxY - scene.bounds.minY
  const scale = Math.min((width - margin * 2) / Math.max(1, w), (height - margin * 2) / Math.max(1, h))
  return {
    scale,
    tx: (width - w * scale) / 2 - scene.bounds.minX * scale,
    ty: (height - h * scale) / 2 - scene.bounds.minY * scale,
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
  Record<'back' | 'pan' | 'armLeft' | 'armRight' | 'mark' | 'access', Path2D>
>()

function chairWorldPaths(chairW: number) {
  const key = Math.round(chairW * 100)
  let paths = chairWorldCache.get(key)
  if (!paths) {
    const k = chairW / GLYPH_BOX
    const m = new DOMMatrix([k, 0, 0, k, -12 * k, -12 * k])
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
      mark: scaled(src.mark),
      access: scaled(src.access),
    }
    chairWorldCache.set(key, paths)
  }
  return paths
}

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

  // Paper fill, drafting hatch, ink outline, heavier apron line.
  ctx.fillStyle = C.veil
  ctx.fill(path)
  ctx.save()
  ctx.clip(path)
  ctx.strokeStyle = 'rgba(10, 22, 40, 0.08)'
  ctx.lineWidth = 1.25 / camera.scale
  const b = scene.bounds
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 200
  ctx.beginPath()
  for (let d = -span; d <= span; d += 9) {
    ctx.moveTo(b.minX - 100 + d, b.minY - 100)
    ctx.lineTo(b.minX - 100 + d + span, b.minY - 100 + span)
  }
  ctx.stroke()
  ctx.restore()
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
  const flags = lodFlags(camera.scale)
  if (!flags.seats) return
  const chairPx = scene.chairW * camera.scale
  const tier: GlyphTier = glyphTier(chairPx)
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

  // Stroke widths are screen-fixed: the benchmark's outline is what lets
  // the room breathe, so the line never fattens with zoom.
  const outlineW = 1.25 / camera.scale
  const keylineW = 2 / camera.scale
  const dash = [3 / camera.scale, 2.5 / camera.scale]

  const bodyParts = (draw: (p: Path2D) => void) => {
    if (tier === 'mark') {
      draw(paths.mark)
      return
    }
    draw(paths.back)
    draw(paths.pan)
    if (tier === 'full') {
      draw(paths.armLeft)
      draw(paths.armRight)
    }
  }

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
        ctx.stroke(tier === 'mark' ? paths.mark : paths.back)
        if (tier !== 'mark') ctx.stroke(paths.pan)
      } else if (state === 'taken') {
        // Solid stone, no stroke, no numeral: it recedes.
        ctx.fillStyle = C.stone
        bodyParts(p => ctx.fill(p))
      } else if (state === 'held') {
        // Stone body with the dashed tier-hue stroke.
        ctx.fillStyle = C.stone
        bodyParts(p => ctx.fill(p))
        ctx.strokeStyle = hue ?? C.dusk
        ctx.lineWidth = outlineW
        ctx.setLineDash(dash)
        ctx.stroke(tier === 'mark' ? paths.mark : paths.back)
        if (tier !== 'mark') ctx.stroke(paths.pan)
        ctx.setLineDash([])
      } else {
        // AVAILABLE: outline in the tier hue over paper, never a solid
        // mass: the anatomy the benchmark breathes through.
        ctx.fillStyle = C.white
        bodyParts(p => ctx.fill(p))
        ctx.strokeStyle = hue ?? C.dusk
        ctx.lineWidth = outlineW
        bodyParts(p => ctx.stroke(p))
        if (s.seat_type === 'accessible' && tier !== 'mark') {
          ctx.lineWidth = Math.max(outlineW, scene.chairW * 0.045)
          ctx.lineCap = 'round'
          ctx.stroke(paths.access)
        }
      }
    }
    ctx.restore()
  }
}

/** Screen-space text and rings: numerals, rulers, labels, cursors. */
function drawScreenPass(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, opts: PaintOptions) {
  const flags = lodFlags(camera.scale)
  const view = viewBounds(camera, opts.width, opts.height)

  // Section polygons: filled cards at overview, boundary and label at mid.
  if (flags.polygonFill || flags.polygonEdge) {
    for (const poly of scene.polygons) {
      const path = hullPath(poly.hull)
      ctx.save()
      ctx.setTransform(opts.dpr * camera.scale, 0, 0, opts.dpr * camera.scale, opts.dpr * camera.tx, opts.dpr * camera.ty)
      const pad = poly.pad
      if (flags.polygonFill) {
        // Rounded padding: stroke the hull thick and round-joined in the
        // fill tone, then fill; the outline rides the padded edge.
        ctx.lineJoin = 'round'
        ctx.lineWidth = pad * 2
        ctx.strokeStyle = `${poly.color}42`
        ctx.stroke(path)
        ctx.fillStyle = `${poly.color}42`
        ctx.fill(path)
        ctx.lineWidth = 1.5 / camera.scale
        ctx.strokeStyle = poly.color
        ctx.stroke(path)
      } else {
        ctx.lineJoin = 'round'
        ctx.lineWidth = pad * 2
        ctx.strokeStyle = 'rgba(10, 22, 40, 0)'
        ctx.stroke(path)
        ctx.setLineDash([5 / camera.scale, 4 / camera.scale])
        ctx.lineWidth = 1.25 / camera.scale
        ctx.strokeStyle = `${poly.color}88`
        ctx.stroke(path)
      }
      if (opts.highlightSectionId === poly.sectionId) {
        ctx.setLineDash([])
        ctx.lineWidth = 2.5 / camera.scale
        ctx.strokeStyle = C.gold
        ctx.lineJoin = 'round'
        ctx.stroke(path)
      }
      ctx.restore()

      // The in-place label, screen-fixed type.
      const at = worldToScreen(camera, poly.centroid.x, poly.centroid.y)
      if (at.x < -80 || at.x > opts.width + 80 || at.y < -40 || at.y > opts.height + 40) continue
      ctx.save()
      ctx.textAlign = 'center'
      ctx.font = `700 ${flags.polygonFill ? 13 : 11}px ${DISPLAY_FONT}`
      ctx.fillStyle = C.night
      const name = poly.name.toUpperCase()
      ctx.fillText(name, at.x, at.y - (flags.polygonFill ? 3 : 0))
      if (flags.polygonFill && poly.minPriceCents != null) {
        ctx.font = `600 12px ${DATA_FONT}`
        ctx.fillStyle = C.dusk
        const price =
          poly.maxPriceCents != null && poly.maxPriceCents !== poly.minPriceCents
            ? `${opts.formatPrice(poly.minPriceCents)} to ${opts.formatPrice(poly.maxPriceCents)}`
            : opts.formatPrice(poly.minPriceCents ?? 0)
        ctx.fillText(price, at.x, at.y + 14)
      }
      ctx.restore()
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

  // Stage label: small caps in the apron, never a bar.
  if (scene.stage) {
    const at = worldToScreen(camera, scene.stage.labelAt.x, scene.stage.labelAt.y)
    if (at.x > -60 && at.x < opts.width + 60 && at.y > -20 && at.y < opts.height + 20) {
      ctx.save()
      ctx.textAlign = 'center'
      ctx.font = `600 10px ${DATA_FONT}`
      ctx.fillStyle = C.dusk
      ctx.letterSpacing = '3px'
      ctx.fillText('STAGE', at.x, at.y)
      ctx.restore()
    }
  }

  // Area labels.
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

  // Row letters on BOTH flanks. Dusk ink: 4.5:1 on the Veil paper.
  if (flags.rowLetters) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 11px ${DATA_FONT}`
    ctx.fillStyle = C.dusk
    for (const row of scene.rowLabels) {
      for (const side of [row.left, row.right]) {
        if (side.x < view.minX - 30 || side.x > view.maxX + 30 || side.y < view.minY - 30 || side.y > view.maxY + 30) continue
        const at = worldToScreen(camera, side.x, side.y)
        ctx.fillText(row.label, at.x, at.y)
      }
    }
    ctx.restore()
  }

  // The seat-number ruler along each section's front edge.
  if (flags.numerals) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 10px ${DATA_FONT}`
    ctx.fillStyle = C.dusk
    for (const mark of scene.rulers) {
      if (mark.x < view.minX || mark.x > view.maxX || mark.y < view.minY - 30 || mark.y > view.maxY) continue
      const at = worldToScreen(camera, mark.x, mark.y)
      ctx.fillText(mark.text, at.x, at.y)
    }
    ctx.restore()
  }

  // Numerals live OUTSIDE the chair: below it, dusk ink, and only once
  // the chair renders at 20px or more. The chair itself stays clean; the
  // flank letters, the ruler and the tooltip carry location before that.
  const chairPx = scene.chairW * camera.scale
  if (flags.numerals && chairPx >= NUMERAL_CHAIR_PX) {
    const visible = cullSeats(scene, view)
    const dropPx = chairPx * 0.62 + 7
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 9px ${DATA_FONT}`
    ctx.fillStyle = C.dusk
    for (const i of visible) {
      const state = opts.stateFor(i)
      if (state === 'taken' || state === 'held') continue
      const s = scene.seats[i]
      const at = worldToScreen(camera, s.x, s.y)
      ctx.globalAlpha = state === 'dimmed' ? 0.35 : 1
      ctx.fillText(s.seat_number, at.x, at.y + dropPx)
    }
    ctx.restore()
  }

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
      ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0)
      const at = worldToScreen(camera, obj.x + w / 2, obj.y + h / 2)
      ctx.translate(at.x, at.y)
      if (obj.rotation) ctx.rotate((obj.rotation * Math.PI) / 180)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const px = Math.max(9, (obj.size ?? 14) * camera.scale)
      ctx.font = `700 ${px}px ${DISPLAY_FONT}`
      ctx.fillStyle = C.night
      ctx.fillText((obj.text ?? '').toUpperCase(), 0, 0)
      ctx.restore()
      continue
    }

    const kind = (obj.object ?? 'bar') as VenueObjectKind
    if (obj.kind === 'object') {
      // The chip: paper fill, ink outline.
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h / 2, w, h, 8)
      ctx.fillStyle = C.veil
      ctx.fill()
      ctx.strokeStyle = 'rgba(10, 22, 40, 0.45)'
      ctx.lineWidth = 1.25 / camera.scale
      ctx.stroke()
    }
    // The glyph, centred, at 55% of the chip's smaller side.
    const g = Math.min(w, h) * (obj.kind === 'icon' ? 0.9 : 0.5)
    const k = g / GLYPH_BOX
    ctx.translate(-g / 2, obj.kind === 'object' ? -g / 2 - h * 0.08 : -g / 2)
    ctx.scale(k, k)
    ctx.strokeStyle = C.night
    ctx.lineWidth = 1.6 / (camera.scale * k)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const p of objectPaths(kind)) ctx.stroke(p)
    ctx.restore()

    // The label under the glyph, screen-fixed: identity transform, since
    // the surrounding pass still carries the world matrix.
    if (obj.kind === 'object') {
      const at = worldToScreen(camera, obj.x + w / 2, obj.y + h * 0.82)
      ctx.save()
      ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.font = `600 10px ${DATA_FONT}`
      ctx.fillStyle = C.dusk
      ctx.fillText(obj.label ?? OBJECT_GLYPHS[kind].label, at.x, at.y)
      ctx.restore()
    }
  }
}

/** The full frame: clears, paints world geometry, then the screen pass. */
export function paintScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  opts: PaintOptions,
) {
  const { dpr, width, height } = opts
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = C.veil
  ctx.fillRect(0, 0, width, height)

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

  // World pass.
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
    ctx.fillStyle = 'rgba(10, 22, 40, 0.12)'
    ctx.fill(path)
  }
  for (const poly of scene.polygons) {
    const path = hullPath(poly.hull)
    ctx.lineJoin = 'round'
    ctx.lineWidth = poly.pad * 2
    ctx.strokeStyle = `${poly.color}55`
    ctx.stroke(path)
    ctx.fillStyle = `${poly.color}55`
    ctx.fill(path)
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
    ctx.fillStyle = `${area.color}33`
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
