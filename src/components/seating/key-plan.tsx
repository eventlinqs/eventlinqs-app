'use client'

/**
 * The key plan: the sheet's corner block, an architect's plan-within-the-
 * plan. Draws the whole room in miniature (polygons, stage hatch, zones)
 * with the buyer's viewport as the ONLY gold rectangle, and navigates on
 * click or drag. Appears once the camera is meaningfully inside the room.
 */

import { useEffect, useRef } from 'react'
import { miniMapCamera, paintMiniMap, screenToWorld, type Camera } from '@/lib/seating/render/draw'
import type { Scene } from '@/lib/seating/render/scene'

interface Props {
  scene: Scene
  camera: Camera
  viewWidth: number
  viewHeight: number
  width: number
  height: number
  onNavigate: (worldX: number, worldY: number) => void
  className?: string
}

export function KeyPlan({ scene, camera, viewWidth, viewHeight, width, height, onNavigate, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    paintMiniMap(ctx, scene, camera, { dpr, width, height, viewWidth, viewHeight })
  }, [scene, camera, width, height, viewWidth, viewHeight])

  const navigate = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mini = miniMapCamera(scene, width, height)
    const world = screenToWorld(mini, e.clientX - rect.left, e.clientY - rect.top)
    onNavigate(world.x, world.y)
  }

  return (
    <div
      className={`overflow-hidden rounded-sm border border-ink-900/25 bg-white shadow-sm ${className ?? ''}`}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="block cursor-pointer"
        onPointerDown={e => {
          draggingRef.current = true
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          navigate(e)
        }}
        onPointerMove={e => {
          if (draggingRef.current) navigate(e)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
      />
    </div>
  )
}
