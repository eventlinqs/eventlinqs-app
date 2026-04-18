'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * useDragScroll — desktop mouse-drag-to-scroll for horizontal rails.
 *
 * Wires pointerdown/move/up listeners to a scroll container. While the
 * pointer is down and dragging horizontally, scrollLeft tracks the
 * pointer delta. After a drag past 5px, sets `data-dragged="true"` on
 * the container so card-level click handlers can suppress navigation
 * (see SnapRail card click suppression).
 *
 * No-ops on touch devices (browser native scroll already handles it)
 * and only activates when pointerType === 'mouse'.
 */

const DRAG_THRESHOLD_PX = 5

export function useDragScroll<T extends HTMLElement>(ref: RefObject<T | null>) {
  const stateRef = useRef({ dragging: false, startX: 0, startScroll: 0, moved: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function clearDragFlag() {
      // Defer flag clear until after the click event fires so card handlers see it.
      setTimeout(() => { el?.removeAttribute('data-dragged') }, 0)
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return
      // Don't hijack drags on form controls / interactive elements
      const target = e.target as HTMLElement
      if (target.closest('button, input, select, textarea, a[download]')) return

      stateRef.current = {
        dragging: true,
        startX: e.clientX,
        startScroll: el!.scrollLeft,
        moved: 0,
      }
      el!.style.cursor = 'grabbing'
      el!.style.userSelect = 'none'
    }

    function onPointerMove(e: PointerEvent) {
      const s = stateRef.current
      if (!s.dragging) return
      const dx = e.clientX - s.startX
      s.moved = Math.abs(dx)
      el!.scrollLeft = s.startScroll - dx
      if (s.moved > DRAG_THRESHOLD_PX) {
        el!.setAttribute('data-dragged', 'true')
      }
    }

    function onPointerUp() {
      const s = stateRef.current
      if (!s.dragging) return
      stateRef.current.dragging = false
      el!.style.cursor = ''
      el!.style.userSelect = ''
      if (s.moved > DRAG_THRESHOLD_PX) {
        clearDragFlag()
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [ref])
}
