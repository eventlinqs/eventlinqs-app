'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Accessibility,
  Ban,
  Circle,
  DoorOpen,
  Eraser,
  HeartHandshake,
  ImageUp,
  MousePointer2,
  Printer,
  RectangleHorizontal,
  Rows3,
  ScanLine,
  Square,
  StickyNote,
  Tag,
  Undo2,
  X,
} from 'lucide-react'
import {
  generateLayout,
  validateLayout,
  type AisleBlock,
  type AreaBlock,
  type IconBlock,
  type ObjectBlock,
  type RowsBlock,
  type SeatBlock,
  type StageBlockDef,
  type TableBlock,
  type TextBlock,
} from '@/lib/seating/generate'
import { SECTION_COLORS, editorialSectionColor, sectionColorForSet } from '@/lib/seating/palette'
import { detectSeatCount } from '@/lib/seating/detect'
import { useSeatPaletteSet } from '@/lib/seating/use-seat-palette'
import { buildScene, type SceneObjectInput } from '@/lib/seating/render/scene'
import { stageGeometry } from '@/lib/seating/render/stage'
import { OBJECT_GLYPHS, type VenueObjectKind } from '@/lib/seating/render/glyphs'
import { STAGE_SHAPE_META } from '@/lib/seating/render/stage'
import { sceneToPrintSvg } from '@/lib/seating/render/svg-export'
import type { Camera } from '@/lib/seating/render/draw'
import { SeatCanvas, type SeatCanvasHandle } from '@/components/seating/seat-canvas'
import { uploadSectionViewPhoto, removeSectionViewPhoto } from '@/app/actions/section-view-photo'
import { SectionViewImage } from '@/components/media/SectionViewImage'
import { saveSeatMap } from './actions'

/**
 * The room studio on the drawing sheet: the organiser composes blocks
 * (rows, tables, standing areas), the stage as geometry, aisles, venue
 * objects and captions on the same retained-scene canvas the buyer sees.
 * Seat-level marking is a click mode; the inspector is a column on
 * desktop and a compact numbers strip on a phone so the room stays in
 * view while its numbers are edited. Preview and save run the SAME pure
 * generator, so what the organiser sees is exactly what materialises.
 */

type SeatMode = 'move' | 'blocked' | 'accessible' | 'companion' | 'remove' | 'relabel' | 'note' | 'detect'

const GOLD = '#D4A017'
const SNAP_GRID = 4
const ALIGN_SNAP = 6

let blockCounter = 0
function newId(prefix: string): string {
  blockCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${blockCounter}`
}

function toggleRef(list: string[] | undefined, ref: string): string[] {
  const set = new Set(list ?? [])
  if (set.has(ref)) set.delete(ref)
  else set.add(ref)
  return [...set]
}

interface Props {
  venueId: string
  seatMapId: string | null
  initialName: string
  initialBlocks: SeatBlock[]
  /** Live attachment: how many published events sit on this chart. */
  liveUsage?: { events: number; protectedSeats: number }
  /** View-from-seat photos for this chart: lowercased section name -> url. */
  initialSectionViews?: Record<string, string>
  onClose: () => void
}

interface SeatEdit {
  blockId: string
  ref: string
  kind: 'relabel' | 'note'
  value: string
}

interface TraceState {
  url: string
  opacity: number
  image: HTMLImageElement | null
}

const ROOM_OBJECTS: { kind: VenueObjectKind; label: string }[] = (
  Object.keys(OBJECT_GLYPHS) as VenueObjectKind[]
).map(kind => ({ kind, label: OBJECT_GLYPHS[kind].label }))

export function SeatMapBuilder({
  venueId,
  seatMapId,
  initialName,
  initialBlocks,
  liveUsage,
  initialSectionViews,
  onClose,
}: Props) {
  const router = useRouter()
  const canvasRef = useRef<SeatCanvasHandle>(null)
  const historyRef = useRef<SeatBlock[][]>([])
  const redoRef = useRef<SeatBlock[][]>([])
  const lastEditKeyRef = useRef<string | null>(null)
  const dragRef = useRef<{
    blockId: string
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const detectRef = useRef<{ x: number; y: number } | null>(null)
  const traceInputRef = useRef<HTMLInputElement | null>(null)

  const [name, setName] = useState(initialName)
  const [blocks, setBlocks] = useState<SeatBlock[]>(() =>
    initialBlocks.map(b => (b.color ? { ...b, color: editorialSectionColor(b.color) } : b)),
  )
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null)
  const [mode, setMode] = useState<SeatMode>('move')
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [detectCursor, setDetectCursor] = useState<{ x: number; y: number } | null>(null)
  const [seatEdit, setSeatEdit] = useState<SeatEdit | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [inspectorExpanded, setInspectorExpanded] = useState(false)
  /**
   * The trace: a floor plan photo INSIDE the canvas, under the grid, with
   * its transparency chip floating on the sheet. Session-only by design:
   * the image never persists into the chart.
   */
  const [trace, setTrace] = useState<TraceState | null>(null)
  const [paletteSet] = useSeatPaletteSet()
  const [sectionViews, setSectionViews] = useState<Record<string, string>>(initialSectionViews ?? {})
  const [viewBusy, setViewBusy] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const roomMenuRef = useRef<HTMLDivElement>(null)

  const layout = useMemo(() => generateLayout(blocks), [blocks])
  const issues = useMemo(() => validateLayout(layout), [layout])
  const selected = blocks.find(b => b.id === selectedId) ?? null

  // ── The scene: generated seats plus stage, objects and zones. ───────────
  const scene = useMemo(() => {
    const seats = layout.sections.flatMap(section =>
      section.rows.flatMap(row =>
        row.seats.map(seat => ({
          id: `${seat.blockId ?? section.name}|${seat.ref ?? `${row.label}-${seat.number}`}`,
          x: seat.x,
          y: seat.y,
          row_label: row.label,
          seat_number: seat.number,
          seat_type: seat.type,
          status: seat.blocked ? 'blocked' : 'available',
          seat_map_section_id: section.name,
          ticket_tier_id: null,
        })),
      ),
    )
    const objects: SceneObjectInput[] = (layout.objects ?? []).map(o => ({ ...o }))
    return buildScene({
      seats,
      sections: layout.sections.map(s => ({ id: s.name, name: s.name, color: s.color })),
      areas: layout.areas.map(a => ({ ...a, color: sectionColorForSet(a.color, paletteSet) })),
      stage: layout.stage ?? undefined,
      objects,
      colorForSeat: s => {
        const section = layout.sections.find(sec => sec.name === s.seat_map_section_id)
        return sectionColorForSet(section?.color, paletteSet)
      },
    })
  }, [layout, paletteSet])

  const seatByIndex = useMemo(() => {
    // Scene seat id encodes blockId|ref for the marking tools.
    return scene.seats.map(s => {
      const [blockId, ref] = s.id.split('|')
      return { blockId, ref }
    })
  }, [scene])

  // ── Undo and redo (kept: coalesced bursts, redo lane cleared). ──────────
  const pushHistory = useCallback(
    (editKey: string | null = null) => {
      if (editKey !== null && lastEditKeyRef.current === editKey) return
      lastEditKeyRef.current = editKey
      historyRef.current.push(blocks.map(b => ({ ...b })))
      if (historyRef.current.length > 50) historyRef.current.shift()
      redoRef.current = []
      setCanUndo(true)
      setCanRedo(false)
    },
    [blocks],
  )

  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    lastEditKeyRef.current = null
    redoRef.current.push(blocks.map(b => ({ ...b })))
    setBlocks(prev)
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
    setSeatEdit(null)
    setGuides({ x: null, y: null })
  }

  function redo() {
    const next = redoRef.current.pop()
    if (!next) return
    lastEditKeyRef.current = null
    historyRef.current.push(blocks.map(b => ({ ...b })))
    setBlocks(next)
    setCanUndo(true)
    setCanRedo(redoRef.current.length > 0)
    setSeatEdit(null)
    setGuides({ x: null, y: null })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault()
        redo()
      }
      if (e.key === 'Escape') {
        setSeatEdit(null)
        setRoomMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Close the room menu on outside click.
  useEffect(() => {
    if (!roomMenuOpen) return
    function onDown(e: MouseEvent) {
      if (roomMenuRef.current && !roomMenuRef.current.contains(e.target as Node)) {
        setRoomMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [roomMenuOpen])

  function updateBlock(id: string, patch: Partial<SeatBlock>) {
    setBlocks(prev => prev.map(b => (b.id === id ? ({ ...b, ...patch } as SeatBlock) : b)))
  }

  function editBlock(id: string, patch: Partial<SeatBlock>) {
    pushHistory(`edit:${id}:${Object.keys(patch).sort().join(',')}`)
    updateBlock(id, patch)
  }

  // ── The trace image, a citizen of the canvas (item 11). ─────────────────
  function onTraceFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setTrace(prev => {
      if (prev) URL.revokeObjectURL(prev.url)
      const url = URL.createObjectURL(file)
      const image = new window.Image()
      image.onload = () => setTrace(t => (t && t.url === url ? { ...t } : t))
      image.src = url
      return { url, opacity: 0.35, image }
    })
  }

  /** Where the trace sits in world units: contained in the scene bounds. */
  const tracePlacement = useMemo(() => {
    const img = trace?.image
    if (!trace || !img || !img.naturalWidth) return null
    const b = scene.bounds
    const boxW = Math.max(320, b.maxX - b.minX)
    const boxH = Math.max(240, b.maxY - b.minY)
    const fit = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight)
    const w = img.naturalWidth * fit
    const h = img.naturalHeight * fit
    return {
      image: img,
      opacity: trace.opacity,
      x: b.minX + (boxW - w) / 2,
      y: b.minY + (boxH - h) / 2,
      width: w,
      height: h,
    }
  }, [trace, scene.bounds])

  /**
   * Assisted seat detection over the trace (kept and carried): the
   * organiser drags along one row of the plan; the pixels under the line
   * are sampled, dark blobs counted, and a rows block lands on the line.
   */
  const detectRowAlongLine = useCallback(
    async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const placement = tracePlacement
      const lineLength = Math.hypot(b.x - a.x, b.y - a.y)
      if (!placement || lineLength < 24) {
        setMessage('Drag a longer line along one row of the plan.')
        return
      }
      const angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

      let detected: number | null = null
      try {
        const img = placement.image
        const scaleDown = Math.min(1, 1400 / img.naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scaleDown))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scaleDown))
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('no 2d context')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const toImage = (p: { x: number; y: number }) => ({
          x: ((p.x - placement.x) / placement.width) * canvas.width,
          y: ((p.y - placement.y) / placement.height) * canvas.height,
        })
        const A = toImage(a)
        const B = toImage(b)
        const samples = 500
        const ux = (B.y - A.y) / Math.hypot(B.x - A.x, B.y - A.y)
        const uy = -(B.x - A.x) / Math.hypot(B.x - A.x, B.y - A.y)
        const lums: number[] = []
        for (let i = 0; i < samples; i++) {
          const t = i / (samples - 1)
          const px = A.x + (B.x - A.x) * t
          const py = A.y + (B.y - A.y) * t
          let sum = 0
          let n = 0
          for (const k of [-1, 0, 1]) {
            const x = Math.round(px + ux * k)
            const y = Math.round(py + uy * k)
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue
            const at = (y * canvas.width + x) * 4
            sum += 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2]
            n += 1
          }
          lums.push(n > 0 ? sum / n : 255)
        }
        detected = detectSeatCount(lums)
      } catch {
        detected = null
      }

      const fallbackCount = Math.min(60, Math.max(2, Math.round(lineLength / 24)))
      const count = detected ?? fallbackCount
      const spacing = Math.min(44, Math.max(14, lineLength / Math.max(1, count - 1)))

      pushHistory()
      const idx = blocks.length
      const block: RowsBlock = {
        id: newId('rows'),
        kind: 'rows',
        section: `Section ${idx + 1}`,
        color: SECTION_COLORS[idx % SECTION_COLORS.length],
        x: Math.round(a.x / SNAP_GRID) * SNAP_GRID,
        y: Math.round(a.y / SNAP_GRID) * SNAP_GRID,
        rows: 1,
        seatsPerRow: count,
        rotation: Math.round(angleDeg * 10) / 10,
        seatSpacing: Math.round(spacing * 10) / 10,
      }
      setBlocks(prev => [...prev, block])
      setSelectedId(block.id)
      setMessage(
        detected !== null
          ? `Detected ${count} seats along the line. Adjust the count, spacing or rows in the inspector; drag the next row to keep going.`
          : `Low contrast along that line, so ${count} seats were laid evenly instead. Adjust in the inspector.`,
      )
    },
    [blocks.length, pushHistory, tracePlacement],
  )

  // ── Block geometry for hit-testing and selection bounds. ────────────────
  const blockBounds = useCallback(
    (block: SeatBlock): { x: number; y: number; w: number; h: number } | null => {
      if (block.kind === 'rows' || block.kind === 'table') {
        const xs: number[] = []
        const ys: number[] = []
        for (const s of layout.sections) {
          for (const r of s.rows) {
            for (const seat of r.seats) {
              if (seat.blockId === block.id) {
                xs.push(seat.x)
                ys.push(seat.y)
              }
            }
          }
        }
        if (xs.length === 0) return null
        const pad = scene.chairW * 0.75 + 6
        const minX = Math.min(...xs) - pad
        const minY = Math.min(...ys) - pad
        return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY }
      }
      if (block.kind === 'area') {
        return { x: block.x, y: block.y, w: block.width, h: block.height }
      }
      if (block.kind === 'stage') {
        const g = stageGeometry({ shape: block.shape, x: block.x, y: block.y, width: block.width, depth: block.depth, rotation: block.rotation })
        const xs = g.outline.map(p => p.x)
        const ys = [...g.outline.map(p => p.y), ...g.apron.map(p => p.y)]
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
      }
      if (block.kind === 'aisle') {
        return block.orientation === 'vertical'
          ? { x: block.x, y: block.y, w: block.width, h: block.length }
          : { x: block.x, y: block.y, w: block.length, h: block.width }
      }
      if (block.kind === 'object') {
        return { x: block.x, y: block.y, w: block.width, h: block.height }
      }
      // Text and icon: a small handle box around the anchor.
      const size = (block as TextBlock | IconBlock).size ?? 24
      return { x: block.x - size, y: block.y - size / 2, w: size * 2, h: size }
    },
    [layout, scene.chairW],
  )

  const hitBlock = useCallback(
    (world: { x: number; y: number }): SeatBlock | null => {
      // Topmost first: later blocks win; seat blocks win via their seats.
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blockBounds(blocks[i])
        if (!b) continue
        if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
          return blocks[i]
        }
      }
      return null
    },
    [blocks, blockBounds],
  )

  // ── Canvas interactions: claim drags in move and detect modes. ──────────
  const onWorldPointerDown = useCallback(
    (world: { x: number; y: number }): boolean => {
      if (mode === 'detect' && tracePlacement) {
        detectRef.current = world
        setDetectCursor(world)
        return true
      }
      if (mode !== 'move') return false
      const block = hitBlock(world)
      if (!block) return false
      setSelectedId(block.id)
      setInspectorExpanded(false)
      dragRef.current = {
        blockId: block.id,
        startX: world.x,
        startY: world.y,
        originX: block.x,
        originY: block.y,
        moved: false,
      }
      return true
    },
    [mode, tracePlacement, hitBlock],
  )

  const onWorldPointerMove = useCallback(
    (world: { x: number; y: number }) => {
      if (mode === 'detect' && detectRef.current) {
        setDetectCursor(world)
        return
      }
      const drag = dragRef.current
      if (!drag) return
      if (!drag.moved && Math.hypot(world.x - drag.startX, world.y - drag.startY) > 3) {
        drag.moved = true
        pushHistory(`drag:${drag.blockId}`)
      }
      if (!drag.moved) return
      let nx = Math.round((drag.originX + (world.x - drag.startX)) / SNAP_GRID) * SNAP_GRID
      let ny = Math.round((drag.originY + (world.y - drag.startY)) / SNAP_GRID) * SNAP_GRID
      let gx: number | null = null
      let gy: number | null = null
      for (const other of blocks) {
        if (other.id === drag.blockId) continue
        if (Math.abs(nx - other.x) <= ALIGN_SNAP) {
          nx = other.x
          gx = other.x
        }
        if (Math.abs(ny - other.y) <= ALIGN_SNAP) {
          ny = other.y
          gy = other.y
        }
      }
      setGuides({ x: gx, y: gy })
      updateBlock(drag.blockId, { x: nx, y: ny })
    },
    [mode, blocks, pushHistory],
  )

  const onWorldPointerUp = useCallback(
    (world: { x: number; y: number }) => {
      if (mode === 'detect' && detectRef.current) {
        const start = detectRef.current
        detectRef.current = null
        setDetectCursor(null)
        void detectRowAlongLine(start, world)
        return
      }
      dragRef.current = null
      setGuides({ x: null, y: null })
    },
    [mode, detectRowAlongLine],
  )

  /** Seat taps apply the marking tools; in move mode they select. */
  const onSeatActivate = useCallback(
    (index: number) => {
      const target = seatByIndex[index]
      if (!target?.blockId) return
      if (mode === 'move' || mode === 'detect') return
      const block = blocks.find(b => b.id === target.blockId)
      if (!block || (block.kind !== 'rows' && block.kind !== 'table')) return
      const ref = target.ref
      if (!ref) return
      if (mode === 'blocked' || mode === 'accessible' || mode === 'companion' || mode === 'remove') {
        pushHistory()
      }
      if (mode === 'blocked') updateBlock(block.id, { blockedSeats: toggleRef(block.blockedSeats, ref) })
      if (mode === 'accessible') updateBlock(block.id, { accessibleSeats: toggleRef(block.accessibleSeats, ref) })
      if (mode === 'companion') updateBlock(block.id, { companionSeats: toggleRef(block.companionSeats, ref) })
      if (mode === 'remove' && block.kind === 'rows') {
        updateBlock(block.id, { removedSeats: toggleRef(block.removedSeats, ref) })
      }
      if (mode === 'relabel') {
        setSeatEdit({ blockId: block.id, ref, kind: 'relabel', value: block.labelOverrides?.[ref] ?? ref.split('-').pop() ?? '' })
      }
      if (mode === 'note') {
        setSeatEdit({ blockId: block.id, ref, kind: 'note', value: block.notes?.[ref] ?? '' })
      }
    },
    [seatByIndex, mode, blocks, pushHistory],
  )

  // ── Keyboard: Tab cycles blocks, arrows nudge, Delete removes. ──────────
  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (blocks.length === 0) return false
      if (e.key === 'Tab') {
        e.preventDefault()
        const index = blocks.findIndex(b => b.id === selectedId)
        const nextIndex = e.shiftKey
          ? index <= 0
            ? blocks.length - 1
            : index - 1
          : index === -1 || index === blocks.length - 1
            ? 0
            : index + 1
        const next = blocks[nextIndex]
        setSelectedId(next.id)
        const kindWord =
          next.kind === 'rows'
            ? 'rows block'
            : next.kind === 'table'
              ? 'table'
              : next.kind === 'area'
                ? 'standing area'
                : next.kind
        setAnnounce(`Selected ${next.section || kindWord} ${kindWord}. Arrow keys move it; Delete removes it.`)
        const b = blockBounds(next)
        if (b) canvasRef.current?.centreOnWorld(b.x + b.w / 2, b.y + b.h / 2)
        return true
      }
      if (!selectedId) return false
      const block = blocks.find(b => b.id === selectedId)
      if (!block) return false
      const step = e.shiftKey ? SNAP_GRID * 5 : SNAP_GRID
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        pushHistory(`nudge:${selectedId}`)
        updateBlock(selectedId, {
          x: block.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
          y: block.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
        })
        return true
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        setAnnounce(`Removed ${block.section || block.kind}.`)
        return true
      }
      return false
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, selectedId, pushHistory, blockBounds],
  )

  // ── Builder paint extras: aisle bands, selection, guides, detect. ───────
  const paintWorld = useCallback(
    (ctx: CanvasRenderingContext2D, camera: Camera) => {
      // Aisle bands: visible while building, a pure void for buyers.
      for (const block of blocks) {
        if (block.kind !== 'aisle') continue
        const b =
          block.orientation === 'vertical'
            ? { x: block.x, y: block.y, w: block.width, h: block.length }
            : { x: block.x, y: block.y, w: block.length, h: block.width }
        ctx.save()
        ctx.fillStyle = 'rgba(10, 22, 40, 0.05)'
        ctx.fillRect(b.x, b.y, b.w, b.h)
        ctx.setLineDash([5 / camera.scale, 4 / camera.scale])
        ctx.strokeStyle = block.id === selectedId ? GOLD : 'rgba(10, 22, 40, 0.35)'
        ctx.lineWidth = 1.25 / camera.scale
        ctx.strokeRect(b.x, b.y, b.w, b.h)
        ctx.restore()
      }
      // Alignment guides.
      const b = scene.bounds
      ctx.save()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 1 / camera.scale
      ctx.setLineDash([4 / camera.scale, 4 / camera.scale])
      if (guides.x !== null) {
        ctx.beginPath()
        ctx.moveTo(guides.x, b.minY - 200)
        ctx.lineTo(guides.x, b.maxY + 200)
        ctx.stroke()
      }
      if (guides.y !== null) {
        ctx.beginPath()
        ctx.moveTo(b.minX - 200, guides.y)
        ctx.lineTo(b.maxX + 200, guides.y)
        ctx.stroke()
      }
      ctx.restore()
      // The detect line.
      if (detectRef.current && detectCursor) {
        ctx.save()
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 1.5 / camera.scale
        ctx.setLineDash([6 / camera.scale, 5 / camera.scale])
        ctx.beginPath()
        ctx.moveTo(detectRef.current.x, detectRef.current.y)
        ctx.lineTo(detectCursor.x, detectCursor.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = GOLD
        ctx.beginPath()
        ctx.arc(detectRef.current.x, detectRef.current.y, 5 / camera.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      // The selection outline: one dashed gold bound.
      if (selected) {
        const sb = blockBounds(selected)
        if (sb) {
          ctx.save()
          ctx.strokeStyle = GOLD
          ctx.lineWidth = 1.5 / camera.scale
          ctx.setLineDash([6 / camera.scale, 5 / camera.scale])
          ctx.strokeRect(sb.x, sb.y, sb.w, sb.h)
          ctx.restore()
        }
      }
    },
    [blocks, selectedId, selected, guides, detectCursor, scene.bounds, blockBounds],
  )

  // ── Add blocks. ─────────────────────────────────────────────────────────
  function addBlock(kind: 'rows' | 'round' | 'square' | 'area') {
    pushHistory()
    const idx = blocks.length
    const color = SECTION_COLORS[idx % SECTION_COLORS.length]
    const baseX = 120 + (idx % 3) * 60
    const baseY = 120 + idx * 60
    let block: SeatBlock
    if (kind === 'rows') {
      block = {
        id: newId('rows'), kind: 'rows', section: `Section ${idx + 1}`, color,
        x: baseX, y: baseY, rows: 4, seatsPerRow: 8,
      } satisfies RowsBlock
    } else if (kind === 'area') {
      block = {
        id: newId('area'), kind: 'area', section: 'Standing', color,
        label: 'Standing zone', x: baseX, y: baseY, width: 220, height: 90, capacity: 100,
      } satisfies AreaBlock
    } else {
      block = {
        id: newId('table'), kind: 'table', shape: kind, section: `Tables`, color,
        label: `Table ${blocks.filter(b => b.kind === 'table').length + 1}`,
        seats: 8, x: baseX + 60, y: baseY + 40,
      } satisfies TableBlock
    }
    setBlocks(prev => [...prev, block])
    setSelectedId(block.id)
  }

  function addRoomBlock(
    kind: 'stage' | 'aisle' | 'text' | 'icon' | VenueObjectKind,
  ) {
    pushHistory()
    setRoomMenuOpen(false)
    const b = scene.bounds
    let block: SeatBlock
    if (kind === 'stage') {
      const width = Math.max(240, (b.maxX - b.minX) * 0.6)
      block = {
        id: newId('stage'), kind: 'stage', section: '', shape: 'proscenium',
        x: b.minX + (b.maxX - b.minX - width) / 2, y: b.minY - 120, width, depth: 72,
      } satisfies StageBlockDef
    } else if (kind === 'aisle') {
      block = {
        id: newId('aisle'), kind: 'aisle', section: '', orientation: 'vertical',
        x: b.minX + (b.maxX - b.minX) / 2, y: b.minY, length: Math.max(200, b.maxY - b.minY), width: 32,
      } satisfies AisleBlock
    } else if (kind === 'text') {
      block = {
        id: newId('text'), kind: 'text', section: '', text: 'Balcony centre',
        x: b.minX + 160, y: b.maxY + 40, size: 16,
      } satisfies TextBlock
    } else if (kind === 'icon') {
      block = {
        id: newId('icon'), kind: 'icon', section: '', object: 'stairs',
        x: b.minX + 80, y: b.maxY + 40, size: 32,
      } satisfies IconBlock
    } else {
      block = {
        id: newId('object'), kind: 'object', section: '', object: kind,
        x: b.maxX + 48, y: b.minY + 80, width: 64, height: 64,
        label: OBJECT_GLYPHS[kind].label,
      } satisfies ObjectBlock
    }
    setBlocks(prev => [...prev, block])
    setSelectedId(block.id)
  }

  /** Starter shapes (kept): a composed room in one tap. */
  function addPreset(preset: 'theatre' | 'gala' | 'studio') {
    pushHistory()
    let next: SeatBlock[] = []
    if (preset === 'theatre') {
      next = [
        {
          id: newId('stage'), kind: 'stage', section: '', shape: 'proscenium',
          x: 170, y: 10, width: 300, depth: 64,
        } satisfies StageBlockDef,
        {
          id: newId('rows'), kind: 'rows', section: 'Stalls',
          color: SECTION_COLORS[0], x: 140, y: 150, rows: 6, seatsPerRow: 14,
          align: 'centre', autoBow: true, focalRise: 200,
        } satisfies RowsBlock,
        {
          id: newId('rows'), kind: 'rows', section: 'Back Stalls',
          color: SECTION_COLORS[1], x: 140, y: 330, rows: 4, seatsPerRow: 16,
          align: 'centre', autoBow: true, focalRise: 380,
        } satisfies RowsBlock,
      ]
    } else if (preset === 'gala') {
      next = [
        {
          id: newId('stage'), kind: 'stage', section: '', shape: 'band',
          x: 120, y: 10, width: 460, depth: 56,
        } satisfies StageBlockDef,
        ...Array.from({ length: 6 }, (_, i) => ({
          id: newId('table'), kind: 'table' as const, shape: 'round' as const,
          section: 'Tables', color: SECTION_COLORS[2],
          label: `Table ${i + 1}`, seats: 8,
          x: 160 + (i % 3) * 170, y: 160 + Math.floor(i / 3) * 160,
        } satisfies TableBlock)),
      ]
    } else {
      next = [
        {
          id: newId('rows'), kind: 'rows', section: 'Seated',
          color: SECTION_COLORS[5], x: 140, y: 150, rows: 5, seatsPerRow: 10,
          align: 'centre',
        } satisfies RowsBlock,
        {
          id: newId('area'), kind: 'area', section: 'Standing',
          color: SECTION_COLORS[0], label: 'Standing zone',
          x: 140, y: 300, width: 240, height: 100, capacity: 120,
        } satisfies AreaBlock,
      ]
    }
    setBlocks(next)
    setSelectedId(next[0].id)
  }

  function duplicateSelected() {
    if (!selected) return
    pushHistory()
    const copy = {
      ...selected,
      id: newId(selected.kind),
      x: selected.x + 60,
      y: selected.y + 40,
      ...(selected.kind === 'table' ? { label: `${(selected as TableBlock).label} copy` } : {}),
    } as SeatBlock
    setBlocks(prev => [...prev, copy])
    setSelectedId(copy.id)
  }

  function deleteSelected() {
    if (!selectedId) return
    pushHistory()
    setBlocks(prev => prev.filter(b => b.id !== selectedId))
    setSelectedId(null)
  }

  function applySeatEdit() {
    if (!seatEdit) return
    const block = blocks.find(b => b.id === seatEdit.blockId)
    if (!block || (block.kind !== 'rows' && block.kind !== 'table')) {
      setSeatEdit(null)
      return
    }
    pushHistory()
    if (seatEdit.kind === 'relabel') {
      const overrides = { ...(block.labelOverrides ?? {}) }
      const trimmed = seatEdit.value.trim()
      if (trimmed === '' || trimmed === seatEdit.ref.split('-').pop()) delete overrides[seatEdit.ref]
      else overrides[seatEdit.ref] = trimmed
      updateBlock(seatEdit.blockId, { labelOverrides: overrides })
    } else {
      const notes = { ...(block.notes ?? {}) }
      const trimmed = seatEdit.value.trim().slice(0, 120)
      if (trimmed === '') delete notes[seatEdit.ref]
      else notes[seatEdit.ref] = trimmed
      updateBlock(seatEdit.blockId, { notes })
    }
    setSeatEdit(null)
  }

  async function onSave() {
    setSaving(true)
    setMessage(null)
    const result = await saveSeatMap(venueId, seatMapId, name, blocks)
    setSaving(false)
    if (result.success) {
      setMessage(`Saved: ${result.total_seats} seats.`)
      router.refresh()
    } else {
      setMessage(result.error ?? 'Save failed.')
    }
  }

  /** The printed plan: the SVG export path, full furniture LOD. */
  function printPlan() {
    const svg = sceneToPrintSvg(scene, name || 'Seating chart')
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(name || 'seating-chart').toLowerCase().replace(/\s+/g, '-')}-plan.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onSectionViewFile(sectionName: string, file: File | undefined) {
    if (!file || !seatMapId) return
    setViewError(null)
    setViewBusy(sectionName.toLowerCase())
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('seat_map_id', seatMapId)
      form.set('section_name', sectionName)
      const result = await uploadSectionViewPhoto(form)
      if (result.ok) {
        setSectionViews(prev => ({ ...prev, [sectionName.toLowerCase()]: result.photo_url }))
      } else {
        setViewError(result.error)
      }
    } finally {
      setViewBusy(null)
    }
  }

  async function onSectionViewRemove(sectionName: string) {
    if (!seatMapId) return
    setViewError(null)
    setViewBusy(sectionName.toLowerCase())
    try {
      const result = await removeSectionViewPhoto(seatMapId, sectionName)
      if (result.error) setViewError(result.error)
      else {
        setSectionViews(prev => {
          const next = { ...prev }
          delete next[sectionName.toLowerCase()]
          return next
        })
      }
    } finally {
      setViewBusy(null)
    }
  }

  const TOOLS: Array<{ m: SeatMode; label: string; icon: React.ReactNode }> = [
    { m: 'move', label: 'Select and move', icon: <MousePointer2 className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'blocked', label: 'Toggle blocked', icon: <Ban className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'accessible', label: 'Toggle accessible', icon: <Accessibility className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'companion', label: 'Toggle companion', icon: <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'remove', label: 'Remove seat', icon: <Eraser className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'relabel', label: 'Relabel seat', icon: <Tag className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'note', label: 'Add note', icon: <StickyNote className="h-3.5 w-3.5" aria-hidden /> },
    ...(trace
      ? [{ m: 'detect' as const, label: 'Detect a row', icon: <ScanLine className="h-3.5 w-3.5" aria-hidden /> }]
      : []),
  ]

  const paintKey = `${blocks.length}|${selectedId ?? ''}|${guides.x ?? ''}|${guides.y ?? ''}|${detectCursor ? `${detectCursor.x},${detectCursor.y}` : ''}|${paletteSet}|${seatEdit ? `${seatEdit.blockId}:${seatEdit.ref}` : ''}|${JSON.stringify(blocks)}`

  const inspectorOpen = !!(selected || seatEdit)

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5">
      {liveUsage && liveUsage.events > 0 && (
        <div className="mb-4 rounded-panel border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-xs text-ink-900">
          <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            This chart is on {liveUsage.events} live {liveUsage.events === 1 ? 'event' : 'events'}
            {liveUsage.protectedSeats > 0 &&
              `, with ${liveUsage.protectedSeats} sold, reserved or held ${
                liveUsage.protectedSeats === 1 ? 'seat' : 'seats'
              }`}
            .
          </span>{' '}
          Edits here stay on the template; each event applies them from its Seats page after a
          review, and sold or held seats are never touched.
        </div>
      )}

      {/* ── Header: chart identity + element palette ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          aria-label="Seating chart name"
          className="h-11 w-full max-w-xs rounded-control border border-ink-200 px-3 font-display text-base font-bold text-ink-900 focus:border-gold-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['rows', '+ Rows', <Rows3 key="i" className="h-3.5 w-3.5" aria-hidden />],
              ['round', '+ Round table', <Circle key="i" className="h-3.5 w-3.5" aria-hidden />],
              ['square', '+ Square table', <Square key="i" className="h-3.5 w-3.5" aria-hidden />],
              ['area', '+ Standing area', <RectangleHorizontal key="i" className="h-3.5 w-3.5" aria-hidden />],
            ] as const
          ).map(([kind, label, icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => addBlock(kind)}
              className="inline-flex h-11 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 sm:h-10"
            >
              {icon}
              {label}
            </button>
          ))}
          {/* The room palette: stage, aisle, venue objects, text, icon. */}
          <div ref={roomMenuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={roomMenuOpen}
              onClick={() => setRoomMenuOpen(open => !open)}
              className="inline-flex h-11 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 sm:h-10"
            >
              <DoorOpen className="h-3.5 w-3.5" aria-hidden />
              + The room
            </button>
            {roomMenuOpen && (
              <div
                role="menu"
                aria-label="Add a room element"
                className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => addRoomBlock('stage')}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-ink-900 hover:bg-[#EDF0F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  Stage: pick its shape in the inspector
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => addRoomBlock('aisle')}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-ink-900 hover:bg-[#EDF0F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  Aisle: punches a walkway through rows
                </button>
                <p className="px-2.5 pb-1 pt-2 font-display text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  Venue objects
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {ROOM_OBJECTS.map(o => (
                    <button
                      key={o.kind}
                      type="button"
                      role="menuitem"
                      onClick={() => addRoomBlock(o.kind)}
                      className="rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-ink-900 hover:bg-[#EDF0F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      {o.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => addRoomBlock('text')}
                    className="rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-ink-900 hover:bg-[#EDF0F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    Text caption
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => addRoomBlock('icon')}
                    className="rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-ink-900 hover:bg-[#EDF0F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    Icon only
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar: seat tools + undo/redo + trace + print + count ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-control border border-ink-200 bg-canvas p-1">
          {TOOLS.map(t => (
            <button
              key={t.m}
              type="button"
              onClick={() => {
                setMode(t.m)
                setSeatEdit(null)
                detectRef.current = null
                setDetectCursor(null)
              }}
              aria-pressed={mode === t.m}
              aria-label={t.label}
              title={t.label}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 sm:min-h-0 sm:px-2.5 sm:py-1.5 ${
                mode === t.m ? 'bg-ink-900 text-white' : 'bg-transparent text-ink-900 hover:bg-white'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="inline-flex h-11 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 sm:h-9"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="inline-flex h-11 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 sm:h-9"
        >
          <Undo2 className="h-3.5 w-3.5 -scale-x-100" aria-hidden />
          <span className="hidden sm:inline">Redo</span>
        </button>

        <input
          ref={traceInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a floor plan image to trace"
          onChange={e => onTraceFile(e.target.files?.[0])}
        />
        {!trace && (
          <button
            type="button"
            onClick={() => traceInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
          >
            <ImageUp className="h-3.5 w-3.5" aria-hidden />
            Trace a floor plan
          </button>
        )}
        <button
          type="button"
          onClick={printPlan}
          disabled={layout.totalSeats === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Print plan</span>
        </button>
        <span className="ml-auto rounded-full border border-ink-200 bg-canvas px-3 py-1 text-xs font-semibold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {layout.totalSeats.toLocaleString()} seats
          {layout.areas.length > 0 ? ` + ${layout.areas.length} standing ${layout.areas.length === 1 ? 'zone' : 'zones'}` : ''}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── The sheet ── */}
        <div className="relative self-start">
          <SeatCanvas
            ref={canvasRef}
            scene={scene}
            paintKey={paintKey}
            stateFor={i => (scene.seats[i].status === 'blocked' ? 'taken' : 'available')}
            formatPrice={() => ''}
            onSeatActivate={onSeatActivate}
            onWorldPointerDown={onWorldPointerDown}
            onWorldPointerMove={onWorldPointerMove}
            onWorldPointerUp={onWorldPointerUp}
            onCanvasKeyDown={onCanvasKeyDown}
            paintWorld={paintWorld}
            trace={tracePlacement}
            gridDots
            ariaLabel="Seating chart canvas. Tab cycles blocks, arrow keys move the selected block, Shift steps larger, Delete removes it. Drag to pan, pinch or Ctrl and scroll to zoom."
            className="h-[58vh] min-h-[380px] w-full rounded-panel bg-canvas lg:h-[560px]"
          >
            {/* The trace chip: transparency slider ON the sheet. */}
            {trace && (
              <div className="absolute left-3 top-3 inline-flex h-9 items-center gap-2 rounded-control border border-gold-500/50 bg-white/95 px-3 text-xs font-semibold text-ink-900 shadow-sm">
                <ImageUp className="h-3.5 w-3.5 text-gold-800" aria-hidden />
                Floor plan
                <input
                  type="range"
                  min={10}
                  max={70}
                  value={Math.round(trace.opacity * 100)}
                  aria-label="Floor plan visibility"
                  onChange={e =>
                    setTrace(t => (t ? { ...t, opacity: Number(e.target.value) / 100 } : t))
                  }
                  className="h-1 w-20 accent-gold-500"
                />
                <button
                  type="button"
                  aria-label="Remove the floor plan underlay"
                  onClick={() =>
                    setTrace(prev => {
                      if (prev) URL.revokeObjectURL(prev.url)
                      return null
                    })
                  }
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-canvas hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )}

            {/* Zoom cluster. */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-ink-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomOut()}
                className="flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomIn()}
                className="flex h-11 w-11 items-center justify-center text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom in"
              >
                +
              </button>
              <span className="h-6 w-px bg-ink-200" aria-hidden="true" />
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomToFit()}
                className="flex h-11 items-center rounded-r-lg px-2.5 text-[11px] font-semibold text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom to fit"
              >
                Fit
              </button>
            </div>

            {/* The live bow slider (kept), riding the sheet. */}
            {selected && selected.kind === 'rows' && (
              <div className="absolute bottom-3 left-3 hidden items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-sm sm:flex">
                <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink-600">
                  {(selected as RowsBlock).autoBow ? 'Arc' : 'Bow'}
                </span>
                <input
                  type="range"
                  min={0}
                  max={(selected as RowsBlock).autoBow ? 100 : 80}
                  step={2}
                  value={
                    (selected as RowsBlock).autoBow
                      ? Math.round(((400 - Math.min(400, Math.max(60, (selected as RowsBlock).focalRise ?? 160))) / 340) * 100)
                      : ((selected as RowsBlock).curveDepth ?? 0)
                  }
                  aria-label={
                    (selected as RowsBlock).autoBow
                      ? 'Arc tightness: rows wrap closer around the stage'
                      : 'Live bow: bows the selected rows toward the stage'
                  }
                  onChange={e => {
                    const v = Math.max(0, Number(e.target.value) || 0)
                    if ((selected as RowsBlock).autoBow) {
                      editBlock(selected.id, { focalRise: Math.round(400 - (Math.min(100, v) / 100) * 340) } as Partial<SeatBlock>)
                    } else {
                      editBlock(selected.id, { curveDepth: v } as Partial<SeatBlock>)
                    }
                  }}
                  className="h-1.5 w-32 accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                />
              </div>
            )}
          </SeatCanvas>

          {/* The empty sheet is an invitation (kept). */}
          {blocks.length === 0 && !trace && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto mx-4 max-w-sm rounded-2xl border border-ink-200 bg-white/95 p-6 text-center shadow-lg">
                <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                  The room studio
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-ink-900">Draw your room</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-600">
                  Lay your first rows, tables or standing zone, or trace the
                  real floor plan and build over it.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => addBlock('rows')}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gold-500 px-4 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1"
                  >
                    <Rows3 className="h-3.5 w-3.5" aria-hidden />
                    Lay rows
                  </button>
                  <button
                    type="button"
                    onClick={() => traceInputRef.current?.click()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
                  >
                    <ImageUp className="h-3.5 w-3.5" aria-hidden />
                    Trace a plan
                  </button>
                </div>
                <p className="mt-4 font-display text-[11px] font-semibold uppercase tracking-widest text-ink-400">
                  Or start from a shape
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {(
                    [
                      ['theatre', 'Theatre'],
                      ['gala', 'Gala tables'],
                      ['studio', 'Rows and standing'],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addPreset(preset)}
                      className="inline-flex h-10 items-center rounded-full border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Inspector: a column on desktop; on a phone a compact numbers
            strip capped at a third of the screen, so the room STAYS in
            view while its numbers are edited. "More" expands on demand. ── */}
        <div
          className={
            inspectorOpen
              ? `fixed inset-x-0 bottom-0 z-40 space-y-3 overflow-y-auto rounded-t-2xl border-t border-ink-200 bg-white p-4 shadow-xl lg:static lg:z-auto lg:max-h-none lg:space-y-4 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${
                  inspectorExpanded ? 'max-h-[70vh]' : 'max-h-[34vh]'
                }`
              : 'space-y-4'
          }
        >
          {inspectorOpen && (
            <div className="flex items-center justify-between lg:hidden">
              <button
                type="button"
                onClick={() => setInspectorExpanded(v => !v)}
                className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                {inspectorExpanded ? 'Less' : 'More'}
              </button>
              <span aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-ink-900/10" />
              <button
                type="button"
                aria-label="Close the block editor"
                onClick={() => {
                  setSelectedId(null)
                  setSeatEdit(null)
                  setInspectorExpanded(false)
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}

          {seatEdit && (
            <div className="rounded-panel border border-gold-500/50 bg-white p-4">
              <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                {seatEdit.kind === 'relabel' ? `Relabel seat ${seatEdit.ref}` : `Note for seat ${seatEdit.ref}`}
              </p>
              {seatEdit.kind === 'note' && (
                <p className="mt-1 text-xs text-ink-600">Shown on the ticket and the door scan.</p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  value={seatEdit.value}
                  onChange={e => setSeatEdit(s => (s ? { ...s, value: e.target.value } : s))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') applySeatEdit()
                  }}
                  aria-label={seatEdit.kind === 'relabel' ? `New label for seat ${seatEdit.ref}` : `Note for seat ${seatEdit.ref}`}
                  maxLength={seatEdit.kind === 'note' ? 120 : 12}
                  className="h-10 min-w-0 flex-1 rounded-control border border-ink-200 bg-white px-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={applySeatEdit}
                  className="h-10 rounded-control bg-gold-500 px-4 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-600"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setSeatEdit(null)}
                  className="h-10 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 hover:border-ink-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {selected ? (
            <BlockConfig
              block={selected}
              onChange={patch => editBlock(selected.id, patch)}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              viewSlot={
                selected.kind === 'rows' || selected.kind === 'table'
                  ? {
                      canUpload: !!seatMapId,
                      url: sectionViews[selected.section.toLowerCase()],
                      busy: viewBusy === selected.section.toLowerCase(),
                      error: viewError,
                      onFile: file => void onSectionViewFile(selected.section, file),
                      onRemove: () => void onSectionViewRemove(selected.section),
                    }
                  : undefined
              }
            />
          ) : (
            <p className="rounded-panel border border-ink-200 bg-canvas p-4 text-sm text-ink-600">
              Add a block, or select one on the sheet to edit its rows, seats,
              numbering, curve and rotation. The room palette carries the
              stage, aisles, bars, stairs and captions.
            </p>
          )}

          {issues.length > 0 && (
            <div role="alert" className="rounded-panel border border-warning/40 bg-warning/10 p-3 text-xs text-ink-900">
              {issues.slice(0, 4).map(i => (
                <p key={i.message}>{i.message}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || issues.length > 0}
              className="h-11 flex-1 rounded-control bg-gold-500 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save seating chart'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-control border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 hover:border-ink-900"
            >
              Close
            </button>
          </div>
          {message && (
            <p aria-live="polite" className="text-sm text-ink-700">
              {message}
            </p>
          )}
        </div>
      </div>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  )
}

// ── Per-block configuration panel ────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'h-10 w-full rounded-control border border-ink-200 bg-white px-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none'

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-control border border-ink-200 bg-white p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 rounded-[6px] px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
            value === o.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface ViewSlot {
  canUpload: boolean
  url?: string
  busy: boolean
  error: string | null
  onFile: (file: File | undefined) => void
  onRemove: () => void
}

function BlockConfig({
  block,
  onChange,
  onDuplicate,
  onDelete,
  viewSlot,
}: {
  block: SeatBlock
  onChange: (patch: Partial<SeatBlock>) => void
  onDuplicate: () => void
  onDelete: () => void
  viewSlot?: ViewSlot
}) {
  const title =
    block.kind === 'rows'
      ? 'Rows block'
      : block.kind === 'table'
        ? `${(block as TableBlock).shape === 'round' ? 'Round' : 'Square'} table`
        : block.kind === 'area'
          ? 'Standing area'
          : block.kind === 'stage'
            ? 'The stage'
            : block.kind === 'aisle'
              ? 'Aisle'
              : block.kind === 'object'
                ? (block as ObjectBlock).label || 'Venue object'
                : block.kind === 'text'
                  ? 'Text caption'
                  : 'Icon'
  const hasSection = block.kind === 'rows' || block.kind === 'table' || block.kind === 'area'
  return (
    <div className="space-y-3 rounded-panel border border-ink-200 bg-canvas p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-ink-900">{title}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onDuplicate} className="text-xs font-semibold text-ink-600 hover:text-ink-900">
            Duplicate
          </button>
          <button type="button" onClick={onDelete} className="text-xs font-semibold text-error hover:underline">
            Delete
          </button>
        </div>
      </div>

      {hasSection && (
        <>
          <Field label="Section name">
            <input className={inputClass} value={block.section} onChange={e => onChange({ section: e.target.value })} />
          </Field>
          <Field label="Ticket tier (bound by name at event attach)">
            <input
              className={inputClass}
              value={block.tierName ?? ''}
              placeholder="e.g. A Reserve"
              onChange={e => onChange({ tierName: e.target.value || undefined })}
            />
          </Field>
          <Field label="Section colour">
            <div className="flex flex-wrap gap-1.5">
              {SECTION_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => onChange({ color: c })}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: block.color === c ? '#D4A017' : 'transparent' }}
                />
              ))}
            </div>
          </Field>
        </>
      )}

      {block.kind === 'rows' && <RowsConfig block={block as RowsBlock} onChange={onChange} />}
      {block.kind === 'table' && <TableConfig block={block as TableBlock} onChange={onChange} />}
      {block.kind === 'area' && <AreaConfig block={block as AreaBlock} onChange={onChange} />}
      {block.kind === 'stage' && <StageConfig block={block as StageBlockDef} onChange={onChange} />}
      {block.kind === 'aisle' && <AisleConfig block={block as AisleBlock} onChange={onChange} />}
      {block.kind === 'object' && <ObjectConfig block={block as ObjectBlock} onChange={onChange} />}
      {block.kind === 'text' && <TextConfig block={block as TextBlock} onChange={onChange} />}
      {block.kind === 'icon' && <IconConfig block={block as IconBlock} onChange={onChange} />}

      {viewSlot && (
        <div className="rounded-panel border border-ink-200 bg-white p-3">
          <p className="text-xs font-semibold text-ink-600">
            View from {block.section}
            <span className="ml-1 font-normal text-ink-400">(shown to buyers on tap)</span>
          </p>
          {!viewSlot.canUpload ? (
            <p className="mt-1.5 text-xs text-ink-400">Save the chart first, then add a photo taken from this section.</p>
          ) : viewSlot.url ? (
            <div className="mt-2 space-y-2">
              <div className="relative aspect-[3/2] overflow-hidden rounded-lg">
                <SectionViewImage src={viewSlot.url} alt={`The view from ${block.section}`} />
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-within:ring-2 focus-within:ring-gold-400">
                  {viewSlot.busy ? 'Uploading…' : 'Replace photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={viewSlot.busy}
                    onChange={e => viewSlot.onFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  disabled={viewSlot.busy}
                  onClick={viewSlot.onRemove}
                  className="rounded text-xs font-semibold text-ink-400 transition-colors hover:text-ink-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-within:ring-2 focus-within:ring-gold-400">
              <ImageUp className="h-3.5 w-3.5" aria-hidden />
              {viewSlot.busy ? 'Uploading…' : 'Add a photo from this section'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={`Upload the view photographed from ${block.section}`}
                disabled={viewSlot.busy}
                onChange={e => viewSlot.onFile(e.target.files?.[0])}
              />
            </label>
          )}
          {viewSlot.error && (
            <p role="alert" className="mt-1.5 text-xs text-error">
              {viewSlot.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RowsConfig({ block, onChange }: { block: RowsBlock; onChange: (p: Partial<RowsBlock>) => void }) {
  const perRowText = Array.isArray(block.seatsPerRow) ? block.seatsPerRow.join(', ') : String(block.seatsPerRow)
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rows">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={block.rows}
            onChange={e => onChange({ rows: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label="Row labels">
          <select
            className={inputClass}
            value={block.rowLabelScheme ?? 'alpha'}
            onChange={e => onChange({ rowLabelScheme: e.target.value as 'alpha' | 'numeric' })}
          >
            <option value="alpha">A, B, C</option>
            <option value="numeric">1, 2, 3</option>
          </select>
        </Field>
      </div>
      <Field label="Seats per row (one number, or a comma list for uneven rows)">
        <input
          className={inputClass}
          value={perRowText}
          onChange={e => {
            const parts = e.target.value
              .split(',')
              .map(p => Number(p.trim()))
              .filter(n => Number.isFinite(n) && n >= 0)
            if (parts.length === 0) return
            onChange({
              seatsPerRow: parts.length === 1 ? parts[0] : parts,
              rows: parts.length === 1 ? block.rows : parts.length,
            })
          }}
        />
      </Field>
      {/* Directionality (item 10): where row A sits, where seat 1 sits. */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Row order">
          <Segmented
            label="Row order"
            value={block.rowOrder ?? 'down'}
            options={[
              { value: 'down', label: 'A at front' },
              { value: 'up', label: 'A at back' },
            ]}
            onChange={v => onChange({ rowOrder: v })}
          />
        </Field>
        <Field label="Seat order">
          <Segmented
            label="Seat order"
            value={block.seatOrder ?? ((block.reverseSeats ?? false) ? 'rtl' : 'ltr')}
            options={[
              { value: 'ltr', label: '1 at left' },
              { value: 'rtl', label: '1 at right' },
            ]}
            onChange={v => onChange({ seatOrder: v })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First row label">
          <input
            className={inputClass}
            value={String(block.rowLabelStart ?? ((block.rowLabelScheme ?? 'alpha') === 'alpha' ? 'A' : 1))}
            onChange={e => onChange({ rowLabelStart: e.target.value })}
          />
        </Field>
        <Field label="First seat number">
          <input
            type="number"
            className={inputClass}
            value={block.seatStart ?? 1}
            onChange={e => onChange({ seatStart: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Rotation (degrees)">
          <input
            type="number"
            className={inputClass}
            value={block.rotation ?? 0}
            onChange={e => onChange({ rotation: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Skew (px per row)">
          <input
            type="number"
            className={inputClass}
            value={block.skew ?? 0}
            disabled={block.autoBow ?? false}
            title={block.autoBow ? 'Auto-bow already angles the room' : undefined}
            onChange={e => onChange({ skew: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Stagger (px, odd rows)">
          <input
            type="number"
            className={inputClass}
            value={block.stagger ?? 0}
            disabled={block.autoBow ?? false}
            title={block.autoBow ? 'Auto-bow spaces its own arcs' : 'Brick-bond offset so heads do not align'}
            onChange={e => onChange({ stagger: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Row alignment (uneven rows)">
          <select
            className={inputClass}
            value={block.align ?? 'left'}
            onChange={e => onChange({ align: e.target.value as 'left' | 'centre' })}
          >
            <option value="left">Left-anchored</option>
            <option value="centre">Centred (theatre)</option>
          </select>
        </Field>
      </div>

      <div className="space-y-2 rounded-panel border border-ink-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-600">Curve</span>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-900">
            <input
              type="checkbox"
              checked={block.autoBow ?? false}
              onChange={e => onChange({ autoBow: e.target.checked })}
              className="accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            />
            Bow to the stage
          </label>
        </div>
        {block.autoBow ? (
          <Field label="Curve tightness · rows arc around the stage">
            <input
              type="range"
              min={0}
              max={100}
              step={2}
              value={Math.round(((400 - Math.min(400, Math.max(60, block.focalRise ?? 160))) / 340) * 100)}
              aria-label="Curve tightness: higher wraps the rows closer around the stage"
              onChange={e => {
                const t = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                onChange({ focalRise: Math.round(400 - (t / 100) * 340) })
              }}
              className="h-1.5 w-full accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            />
          </Field>
        ) : (
          <>
            <Field label={`Bow, front row${(block.curveDepth ?? 0) > 0 ? ` · ${block.curveDepth}px` : ' · straight'}`}>
              <input
                type="range"
                min={0}
                max={80}
                step={2}
                value={block.curveDepth ?? 0}
                aria-label="Front row bow: 0 is straight, higher bows the row toward the stage"
                onChange={e => onChange({ curveDepth: Math.max(0, Number(e.target.value) || 0) })}
                className="h-1.5 w-full accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              />
            </Field>
            <Field label={`Bow, back row${block.curveBack != null ? ` · ${block.curveBack}px` : ' · follows the front'}`}>
              <input
                type="range"
                min={0}
                max={80}
                step={2}
                value={block.curveBack ?? block.curveDepth ?? 0}
                aria-label="Back row bow: rows between interpolate front to back"
                onChange={e => onChange({ curveBack: Math.max(0, Number(e.target.value) || 0) })}
                className="h-1.5 w-full accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              />
            </Field>
          </>
        )}
      </div>
    </>
  )
}

function TableConfig({ block, onChange }: { block: TableBlock; onChange: (p: Partial<TableBlock>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Table label">
        <input className={inputClass} value={block.label} onChange={e => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Seats">
        <input
          type="number"
          min={1}
          className={inputClass}
          value={block.seats}
          onChange={e => onChange({ seats: Math.max(1, Number(e.target.value) || 1) })}
        />
      </Field>
      <Field label="Seat labels">
        <select
          className={inputClass}
          value={block.seatLabelScheme ?? 'numeric'}
          onChange={e => onChange({ seatLabelScheme: e.target.value as 'alpha' | 'numeric' })}
        >
          <option value="numeric">1, 2, 3</option>
          <option value="alpha">A, B, C</option>
        </select>
      </Field>
      <Field label="Rotation (degrees)">
        <input
          type="number"
          className={inputClass}
          value={block.rotation ?? 0}
          onChange={e => onChange({ rotation: Number(e.target.value) || 0 })}
        />
      </Field>
    </div>
  )
}

function AreaConfig({ block, onChange }: { block: AreaBlock; onChange: (p: Partial<AreaBlock>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Zone label">
        <input className={inputClass} value={block.label} onChange={e => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Type">
        <select
          className={inputClass}
          value={block.style ?? 'zone'}
          onChange={e => onChange({ style: e.target.value as 'zone' | 'scenery' })}
        >
          <option value="zone">Standing zone (sells via tier)</option>
          <option value="scenery">Scenery (bar, exit, mixer)</option>
        </select>
      </Field>
      <Field label="Capacity (sold via the tier)">
        <input
          type="number"
          min={0}
          className={inputClass}
          value={block.capacity ?? 0}
          disabled={block.style === 'scenery'}
          onChange={e => onChange({ capacity: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Field>
      <Field label="Width (px)">
        <input
          type="number"
          min={40}
          className={inputClass}
          value={block.width}
          onChange={e => onChange({ width: Math.max(40, Number(e.target.value) || 40) })}
        />
      </Field>
      <Field label="Height (px)">
        <input
          type="number"
          min={30}
          className={inputClass}
          value={block.height}
          onChange={e => onChange({ height: Math.max(30, Number(e.target.value) || 30) })}
        />
      </Field>
    </div>
  )
}

function StageConfig({ block, onChange }: { block: StageBlockDef; onChange: (p: Partial<StageBlockDef>) => void }) {
  return (
    <>
      <Field label="Stage shape">
        <div className="grid grid-cols-2 gap-1.5">
          {STAGE_SHAPE_META.map(meta => (
            <button
              key={meta.shape}
              type="button"
              aria-pressed={block.shape === meta.shape}
              onClick={() => onChange({ shape: meta.shape })}
              className={`rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                block.shape === meta.shape ? 'border-ink-900 bg-[#EDF0F4]' : 'border-ink-200 bg-white hover:border-gold-500'
              }`}
            >
              <span className="block text-xs font-semibold text-ink-900">{meta.label}</span>
              <span className="block text-[11px] text-ink-600">{meta.hint}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Width (px)">
          <input
            type="number"
            min={80}
            className={inputClass}
            value={block.width}
            onChange={e => onChange({ width: Math.max(80, Number(e.target.value) || 80) })}
          />
        </Field>
        <Field label="Depth (px)">
          <input
            type="number"
            min={32}
            className={inputClass}
            value={block.depth}
            onChange={e => onChange({ depth: Math.max(32, Number(e.target.value) || 32) })}
          />
        </Field>
        <Field label="Rotation">
          <input
            type="number"
            className={inputClass}
            value={block.rotation ?? 0}
            onChange={e => onChange({ rotation: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
    </>
  )
}

function AisleConfig({ block, onChange }: { block: AisleBlock; onChange: (p: Partial<AisleBlock>) => void }) {
  return (
    <>
      <Field label="Direction">
        <Segmented
          label="Aisle direction"
          value={block.orientation}
          options={[
            { value: 'vertical', label: 'Vertical' },
            { value: 'horizontal', label: 'Horizontal' },
          ]}
          onChange={v => onChange({ orientation: v })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Length (px)">
          <input
            type="number"
            min={60}
            className={inputClass}
            value={block.length}
            onChange={e => onChange({ length: Math.max(60, Number(e.target.value) || 60) })}
          />
        </Field>
        <Field label="Width of the gap (px)">
          <input
            type="number"
            min={16}
            className={inputClass}
            value={block.width}
            onChange={e => onChange({ width: Math.max(16, Number(e.target.value) || 16) })}
          />
        </Field>
      </div>
      <p className="text-xs text-ink-600">
        Seats past the aisle line shift outward by its width, so the
        walkway reads in the room and seats-together picks never bridge it.
      </p>
    </>
  )
}

function ObjectConfig({ block, onChange }: { block: ObjectBlock; onChange: (p: Partial<ObjectBlock>) => void }) {
  return (
    <>
      <Field label="Object">
        <select
          className={inputClass}
          value={block.object}
          onChange={e => {
            const object = e.target.value as VenueObjectKind
            onChange({ object, label: OBJECT_GLYPHS[object].label })
          }}
        >
          {ROOM_OBJECTS.map(o => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label on the plan">
        <input className={inputClass} value={block.label ?? ''} onChange={e => onChange({ label: e.target.value })} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Width">
          <input
            type="number"
            min={32}
            className={inputClass}
            value={block.width}
            onChange={e => onChange({ width: Math.max(32, Number(e.target.value) || 32) })}
          />
        </Field>
        <Field label="Height">
          <input
            type="number"
            min={32}
            className={inputClass}
            value={block.height}
            onChange={e => onChange({ height: Math.max(32, Number(e.target.value) || 32) })}
          />
        </Field>
        <Field label="Rotation">
          <input
            type="number"
            className={inputClass}
            value={block.rotation ?? 0}
            onChange={e => onChange({ rotation: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
    </>
  )
}

function TextConfig({ block, onChange }: { block: TextBlock; onChange: (p: Partial<TextBlock>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Text">
        <input className={inputClass} value={block.text} maxLength={48} onChange={e => onChange({ text: e.target.value })} />
      </Field>
      <Field label="Size (px)">
        <input
          type="number"
          min={10}
          max={48}
          className={inputClass}
          value={block.size ?? 16}
          onChange={e => onChange({ size: Math.min(48, Math.max(10, Number(e.target.value) || 16)) })}
        />
      </Field>
      <Field label="Rotation">
        <input
          type="number"
          className={inputClass}
          value={block.rotation ?? 0}
          onChange={e => onChange({ rotation: Number(e.target.value) || 0 })}
        />
      </Field>
    </div>
  )
}

function IconConfig({ block, onChange }: { block: IconBlock; onChange: (p: Partial<IconBlock>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Glyph">
        <select
          className={inputClass}
          value={block.object}
          onChange={e => onChange({ object: e.target.value as VenueObjectKind })}
        >
          {ROOM_OBJECTS.map(o => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Size (px)">
        <input
          type="number"
          min={16}
          max={96}
          className={inputClass}
          value={block.size ?? 32}
          onChange={e => onChange({ size: Math.min(96, Math.max(16, Number(e.target.value) || 32)) })}
        />
      </Field>
    </div>
  )
}
