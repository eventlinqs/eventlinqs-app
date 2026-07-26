'use client'

/**
 * The shared interactive canvas: one camera, gesture and paint engine for
 * the buyer sheet, the room studio and the kit preview. The scene graph
 * and the painters are pure modules; this component owns the DOM canvas,
 * the DPR, the render-on-demand loop, the gestures (drag pan, pinch,
 * Ctrl+wheel, double tap), the keyboard seat cursor, and hit testing. HTML
 * overlays (tooltip, key plan, zoom cluster, docked strip) render as
 * children over the canvas so accessibility stays real.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  fitCamera,
  paintScene,
  screenToWorld,
  type Camera,
  type PaintOptions,
  type SeatVisualState,
} from '@/lib/seating/render/draw'
import { lodState, type LodState } from '@/lib/seating/render/lod'
import { hitTestSeat, type Scene } from '@/lib/seating/render/scene'
import { pointInHull } from '@/lib/seating/render/polygons'

/** Frame times land in a ring buffer the proof harness reads. */
declare global {
  interface Window {
    __seatFrameTimes?: number[]
  }
}

export interface SeatCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: () => void
  zoomToSection: (sectionId: string) => void
  centreOnWorld: (x: number, y: number) => void
  centreOnSeat: (index: number) => void
  getCamera: () => Camera
  getFitScale: () => number
  getViewSize: () => { width: number; height: number }
}

export interface SeatCanvasProps {
  scene: Scene
  /** Bumps a repaint when any display state changes. */
  paintKey: string
  stateFor: (index: number) => SeatVisualState
  formatPrice: (cents: number) => string
  hoverIndex?: number | null
  focusIndex?: number | null
  groupIndices?: number[]
  highlightSectionId?: string | null
  /** A seat was tapped or keyed. */
  onSeatActivate?: (index: number) => void
  /** Hover moved (desktop): index or null, with the client point. */
  onHoverSeat?: (index: number | null, at: { x: number; y: number } | null) => void
  /** The keyboard cursor moved; announce and let the parent track it. */
  onCursorSeat?: (index: number) => void
  onCursorClear?: () => void
  /** Camera changed: scale, the fit scale and the LOD state. */
  onCamera?: (info: { scale: number; fitScale: number; lod: LodState }) => void
  /** A section polygon was tapped at overview zoom. */
  onSectionTap?: (sectionId: string) => void
  /** Builder extras. */
  trace?: PaintOptions['trace']
  gridDots?: boolean
  paintWorld?: PaintOptions['paintWorld']
  paintScreen?: PaintOptions['paintScreen']
  /**
   * Builder interaction claim: return true from pointer-down to own the
   * gesture (block dragging, detect lines); pan and tap then stand aside.
   */
  onWorldPointerDown?: (world: { x: number; y: number }, e: React.PointerEvent) => boolean
  onWorldPointerMove?: (world: { x: number; y: number }, e: React.PointerEvent) => void
  onWorldPointerUp?: (world: { x: number; y: number }, e: React.PointerEvent) => void
  /** Extra keyboard handling before the seat cursor takes the key. */
  onCanvasKeyDown?: (e: React.KeyboardEvent) => boolean
  ariaLabel: string
  className?: string
  /** Non-interactive preview mode (the kit card). */
  readOnly?: boolean
  minHeight?: number
  /** Overlays rendered above the canvas (tooltip, key plan, controls). */
  children?: React.ReactNode
}

const ZOOM_MAX = 2.4
const TAP_SLOP = 7

export const SeatCanvas = forwardRef<SeatCanvasHandle, SeatCanvasProps>(function SeatCanvas(
  {
    scene,
    paintKey,
    stateFor,
    formatPrice,
    hoverIndex,
    focusIndex,
    groupIndices,
    highlightSectionId,
    onSeatActivate,
    onHoverSeat,
    onCursorSeat,
    onCursorClear,
    onCamera,
    onSectionTap,
    trace,
    gridDots,
    paintWorld,
    paintScreen,
    onWorldPointerDown,
    onWorldPointerMove,
    onWorldPointerUp,
    onCanvasKeyDown,
    ariaLabel,
    className,
    readOnly,
    minHeight,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const cameraRef = useRef<Camera>({ scale: 1, tx: 0, ty: 0 })
  const fitScaleRef = useRef(1)
  const frameRef = useRef<number | null>(null)
  const lastLodRef = useRef<LodState | null>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch' | 'claimed'
    startX: number
    startY: number
    startTx: number
    startTy: number
    startDist: number
    startScale: number
    moved: boolean
  }>({ mode: 'idle', startX: 0, startY: 0, startTx: 0, startTy: 0, startDist: 0, startScale: 1, moved: false })
  const animRef = useRef<number | null>(null)

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const propsRef = useRef({ stateFor, formatPrice, hoverIndex, focusIndex, groupIndices, highlightSectionId, trace, gridDots, paintWorld, paintScreen })
  propsRef.current = { stateFor, formatPrice, hoverIndex, focusIndex, groupIndices, highlightSectionId, trace, gridDots, paintWorld, paintScreen }

  const notifyCamera = useCallback(() => {
    const scale = cameraRef.current.scale
    const lod = lodState(scale)
    lastLodRef.current = lod
    onCamera?.({ scale, fitScale: fitScaleRef.current, lod })
  }, [onCamera])

  /** Paint on demand; every camera or state change schedules one frame. */
  const invalidate = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const { width, height, dpr } = sizeRef.current
      const p = propsRef.current
      const t0 = performance.now()
      paintScene(ctx, scene, cameraRef.current, {
        dpr,
        width,
        height,
        stateFor: p.stateFor,
        hoverIndex: p.hoverIndex,
        focusIndex: p.focusIndex,
        groupIndices: p.groupIndices,
        highlightSectionId: p.highlightSectionId,
        formatPrice: p.formatPrice,
        trace: p.trace,
        gridDots: p.gridDots,
        paintWorld: p.paintWorld,
        paintScreen: p.paintScreen,
      })
      const took = performance.now() - t0
      if (typeof window !== 'undefined') {
        const ring = (window.__seatFrameTimes ??= [])
        ring.push(took)
        if (ring.length > 600) ring.splice(0, ring.length - 600)
      }
    })
  }, [scene])

  const clampCamera = useCallback(
    (cam: Camera): Camera => {
      const { width, height } = sizeRef.current
      const minScale = fitScaleRef.current * 0.5
      const scale = Math.min(ZOOM_MAX, Math.max(minScale, cam.scale))
      // Keep at least a third of the room inside the viewport.
      const b = scene.bounds
      const roomW = (b.maxX - b.minX) * scale
      const roomH = (b.maxY - b.minY) * scale
      const minTx = Math.min(width * 0.33 - roomW - b.minX * scale, width - roomW * 0.2 - b.minX * scale)
      const maxTx = Math.max(width * 0.67 - b.minX * scale, b.minX * -scale + width * 0.1)
      const minTy = Math.min(height * 0.33 - roomH - b.minY * scale, height - roomH * 0.2 - b.minY * scale)
      const maxTy = Math.max(height * 0.67 - b.minY * scale, b.minY * -scale + height * 0.1)
      return {
        scale,
        tx: Math.min(maxTx, Math.max(minTx, cam.tx)),
        ty: Math.min(maxTy, Math.max(minTy, cam.ty)),
      }
    },
    [scene],
  )

  const setCamera = useCallback(
    (cam: Camera) => {
      cameraRef.current = clampCamera(cam)
      invalidate()
      notifyCamera()
    },
    [clampCamera, invalidate, notifyCamera],
  )

  const animateTo = useCallback(
    (target: Camera) => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current)
      if (prefersReducedMotion) {
        setCamera(target)
        return
      }
      const from = { ...cameraRef.current }
      const to = clampCamera(target)
      const start = performance.now()
      const D = 240
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D)
        const e = 1 - Math.pow(1 - t, 3)
        setCamera({
          scale: from.scale + (to.scale - from.scale) * e,
          tx: from.tx + (to.tx - from.tx) * e,
          ty: from.ty + (to.ty - from.ty) * e,
        })
        if (t < 1) animRef.current = requestAnimationFrame(step)
        else animRef.current = null
      }
      animRef.current = requestAnimationFrame(step)
    },
    [clampCamera, prefersReducedMotion, setCamera],
  )

  const zoomAround = useCallback(
    (factor: number, cx?: number, cy?: number, animate = false) => {
      const { width, height } = sizeRef.current
      const fx = cx ?? width / 2
      const fy = cy ?? height / 2
      const cam = cameraRef.current
      const nextScale = Math.min(ZOOM_MAX, Math.max(fitScaleRef.current * 0.5, cam.scale * factor))
      const k = nextScale / cam.scale
      const next = { scale: nextScale, tx: fx - (fx - cam.tx) * k, ty: fy - (fy - cam.ty) * k }
      if (animate) animateTo(next)
      else setCamera(next)
    },
    [animateTo, setCamera],
  )

  const fit = useCallback(
    (animate = false) => {
      const { width, height } = sizeRef.current
      if (width === 0 || height === 0) return
      const cam = fitCamera(scene, width, height)
      fitScaleRef.current = cam.scale
      if (animate) animateTo(cam)
      else setCamera(cam)
    },
    [animateTo, scene, setCamera],
  )

  const zoomToSection = useCallback(
    (sectionId: string) => {
      const poly = scene.polygons.find(p => p.sectionId === sectionId)
      if (!poly) return
      const { width, height } = sizeRef.current
      const xs = poly.hull.map(p => p.x)
      const ys = poly.hull.map(p => p.y)
      const pad = poly.pad * 2
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2
      const h = Math.max(...ys) - Math.min(...ys) + pad * 2
      const scale = Math.min(ZOOM_MAX, Math.min((width - 40) / w, (height - 40) / h))
      animateTo({
        scale,
        tx: (width - w * scale) / 2 - (Math.min(...xs) - pad) * scale,
        ty: (height - h * scale) / 2 - (Math.min(...ys) - pad) * scale,
      })
    },
    [animateTo, scene],
  )

  const centreOnWorld = useCallback(
    (x: number, y: number) => {
      const { width, height } = sizeRef.current
      const cam = cameraRef.current
      setCamera({ scale: cam.scale, tx: width / 2 - x * cam.scale, ty: height / 2 - y * cam.scale })
    },
    [setCamera],
  )

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAround(1.35, undefined, undefined, !prefersReducedMotion),
      zoomOut: () => zoomAround(1 / 1.35, undefined, undefined, !prefersReducedMotion),
      zoomToFit: () => fit(!prefersReducedMotion),
      zoomToSection,
      centreOnWorld,
      centreOnSeat: (index: number) => {
        const s = scene.seats[index]
        if (s) centreOnWorld(s.x, s.y)
      },
      getCamera: () => ({ ...cameraRef.current }),
      getFitScale: () => fitScaleRef.current,
      getViewSize: () => ({ width: sizeRef.current.width, height: sizeRef.current.height }),
    }),
    [centreOnWorld, fit, prefersReducedMotion, scene, zoomAround, zoomToSection],
  )

  // Size to the container, DPR-aware; refit when the scene changes.
  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const measure = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2.5, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      const firstFit = sizeRef.current.width === 0
      sizeRef.current = { width, height, dpr }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const cam = fitCamera(scene, width, height)
      fitScaleRef.current = cam.scale
      if (firstFit) {
        cameraRef.current = cam
        notifyCamera()
      } else {
        cameraRef.current = clampCamera(cameraRef.current)
      }
      invalidate()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [scene, clampCamera, invalidate, notifyCamera])

  // Repaint when display state changes.
  useEffect(() => {
    invalidate()
  }, [paintKey, hoverIndex, focusIndex, groupIndices, highlightSectionId, trace, invalidate])

  // Ctrl+wheel zooms at the cursor; plain wheel keeps scrolling the page.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || readOnly) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      zoomAround(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [readOnly, zoomAround])

  const clientToLocal = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return
    const local = clientToLocal(e)
    pointersRef.current.set(e.pointerId, local)
    const pts = [...pointersRef.current.values()]
    if (pts.length === 1) {
      const world = screenToWorld(cameraRef.current, local.x, local.y)
      const claimed = onWorldPointerDown?.(world, e) ?? false
      gestureRef.current = {
        mode: claimed ? 'claimed' : 'idle',
        startX: local.x,
        startY: local.y,
        startTx: cameraRef.current.tx,
        startTy: cameraRef.current.ty,
        startDist: 0,
        startScale: cameraRef.current.scale,
        moved: false,
      }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } else if (pts.length === 2) {
      const g = gestureRef.current
      if (g.mode === 'claimed') onWorldPointerUp?.(screenToWorld(cameraRef.current, local.x, local.y), e)
      g.mode = 'pinch'
      g.moved = true
      g.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      g.startScale = cameraRef.current.scale
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (readOnly) return
    const local = clientToLocal(e)
    const g = gestureRef.current
    if (!pointersRef.current.has(e.pointerId)) {
      // Pure hover.
      if (onHoverSeat && e.pointerType === 'mouse') {
        const world = screenToWorld(cameraRef.current, local.x, local.y)
        const hit = hitTestSeat(scene, world.x, world.y, scene.chairW)
        onHoverSeat(hit, hit != null ? { x: local.x, y: local.y } : null)
      }
      return
    }
    pointersRef.current.set(e.pointerId, local)
    const pts = [...pointersRef.current.values()]

    if (g.mode === 'pinch' && pts.length === 2 && g.startDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      const nextScale = Math.min(ZOOM_MAX, Math.max(fitScaleRef.current * 0.5, g.startScale * (dist / g.startDist)))
      const cam = cameraRef.current
      const k = nextScale / cam.scale
      setCamera({ scale: nextScale, tx: midX - (midX - cam.tx) * k, ty: midY - (midY - cam.ty) * k })
      return
    }

    if (g.mode === 'claimed') {
      onWorldPointerMove?.(screenToWorld(cameraRef.current, local.x, local.y), e)
      return
    }

    if (pts.length === 1) {
      const dx = local.x - g.startX
      const dy = local.y - g.startY
      if (g.mode === 'idle' && Math.hypot(dx, dy) > TAP_SLOP) {
        g.mode = 'pan'
        g.moved = true
        onHoverSeat?.(null, null)
      }
      if (g.mode === 'pan') {
        setCamera({ scale: cameraRef.current.scale, tx: g.startTx + dx, ty: g.startTy + dy })
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (readOnly) return
    const local = clientToLocal(e)
    const g = gestureRef.current
    pointersRef.current.delete(e.pointerId)
    if (g.mode === 'claimed') {
      onWorldPointerUp?.(screenToWorld(cameraRef.current, local.x, local.y), e)
      if (pointersRef.current.size === 0) g.mode = 'idle'
      return
    }
    if (pointersRef.current.size > 0) return
    const wasTap = g.mode === 'idle' && !g.moved
    g.mode = 'idle'
    g.moved = false
    if (!wasTap) return

    const world = screenToWorld(cameraRef.current, local.x, local.y)
    const lod = lodState(cameraRef.current.scale)
    if (lod === 'overview') {
      // A tap at overview enters the tapped section.
      const poly = scene.polygons.find(p => pointInHull(world, p.hull, p.pad))
      if (poly) {
        onSectionTap?.(poly.sectionId)
        zoomToSection(poly.sectionId)
        return
      }
    }
    const hit = hitTestSeat(scene, world.x, world.y, scene.chairW * (e.pointerType === 'touch' ? 1.2 : 0.8))
    if (hit != null) onSeatActivate?.(hit)
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (readOnly) return
    const local = clientToLocal(e)
    if (cameraRef.current.scale >= ZOOM_MAX * 0.95) fit(true)
    else zoomAround(1.6, local.x, local.y, true)
  }

  // ── The keyboard seat cursor: arrows walk the room, Enter selects. ──────
  function onKeyDown(e: React.KeyboardEvent) {
    if (readOnly) return
    if (onCanvasKeyDown?.(e)) return
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (e.key in dirs) {
      e.preventDefault()
      const current = focusIndex != null && focusIndex >= 0 ? scene.seats[focusIndex] : null
      if (!current) {
        // Start on the first selectable seat nearest the stage.
        let first: number | null = null
        for (let i = 0; i < scene.seats.length; i++) {
          if (propsRef.current.stateFor(i) !== 'available') continue
          if (first === null || scene.seats[i].y < scene.seats[first].y ||
            (scene.seats[i].y === scene.seats[first].y && scene.seats[i].x < scene.seats[first].x)) {
            first = i
          }
        }
        if (first != null) onCursorSeat?.(first)
        return
      }
      const [dx, dy] = dirs[e.key]
      let best: number | null = null
      let bestScore = Infinity
      for (let i = 0; i < scene.seats.length; i++) {
        if (i === focusIndex) continue
        const vx = scene.seats[i].x - current.x
        const vy = scene.seats[i].y - current.y
        const along = vx * dx + vy * dy
        if (along <= 2) continue
        const perpendicular = Math.abs(vx * dy - vy * dx)
        const score = along + perpendicular * 2
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      }
      if (best != null) onCursorSeat?.(best)
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && focusIndex != null && focusIndex >= 0) {
      e.preventDefault()
      onSeatActivate?.(focusIndex)
      return
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomAround(1.35, undefined, undefined, true)
      return
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomAround(1 / 1.35, undefined, undefined, true)
      return
    }
    if (e.key === 'Escape') onCursorClear?.()
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ minHeight: minHeight ?? 320, touchAction: readOnly ? undefined : 'none' }}
    >
      <canvas
        ref={canvasRef}
        role={readOnly ? 'img' : 'application'}
        aria-label={ariaLabel}
        tabIndex={readOnly ? -1 : 0}
        className="block h-full w-full cursor-grab focus-visible:outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={e => {
          onHoverSeat?.(null, null)
          onPointerUp(e)
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
      {/* Sheet chrome: the double hairline frame of the drawing sheet. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 border border-ink-900/15" />
      <div aria-hidden className="pointer-events-none absolute inset-1.5 border border-ink-900/[0.07]" />
      {/* Overlay slots: zoom cluster, key plan, docked strip, tooltip. */}
      {children}
    </div>
  )
})
