'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Accessibility,
  Ban,
  Circle,
  Eraser,
  HeartHandshake,
  ImageUp,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  RectangleHorizontal,
  Rows3,
  Square,
  StickyNote,
  Tag,
  Undo2,
  X,
} from 'lucide-react'
import {
  generateLayout,
  validateLayout,
  type AreaBlock,
  type RowsBlock,
  type SeatBlock,
  type TableBlock,
} from '@/lib/seating/generate'
import { SECTION_COLORS, editorialSectionColor, sectionColorForSet } from '@/lib/seating/palette'
import { useSeatPaletteSet } from '@/lib/seating/use-seat-palette'
import { saveSeatMap } from './actions'

/**
 * Visual seat-map builder: the room studio. The organiser composes blocks
 * (row blocks, round and square tables, standing areas), drags them into place
 * on a drafting-table canvas (dot grid, snap-to-grid, sibling alignment guides,
 * zoom, undo), and edits per-block numbering, counts, curve and rotation in the
 * inspector. Seat-level marking (blocked, accessible, companion, remove,
 * relabel, note) is a click mode: pick the tool, click seats; relabel and note
 * edit inline, never through a browser prompt. Preview and save run the SAME
 * pure generator, so what the organiser sees is exactly what materialises.
 */

type SeatMode = 'move' | 'blocked' | 'accessible' | 'companion' | 'remove' | 'relabel' | 'note'

const GOLD = '#D4A017' // --color-gold-500
const INK_900 = '#0A1628'

const SEAT_R = 9
const SNAP_GRID = 4 // the 4px spacing base
const ALIGN_SNAP = 6 // px within which a dragged block locks to a sibling axis

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
  onClose: () => void
}

interface SeatEdit {
  blockId: string
  ref: string
  kind: 'relabel' | 'note'
  value: string
}

export function SeatMapBuilder({ venueId, seatMapId, initialName, initialBlocks, liveUsage, onClose }: Props) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ blockId: string; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const historyRef = useRef<SeatBlock[][]>([])
  const lastEditKeyRef = useRef<string | null>(null)

  const [name, setName] = useState(initialName)
  const [blocks, setBlocks] = useState<SeatBlock[]>(() =>
    initialBlocks.map(b =>
      b.color ? { ...b, color: editorialSectionColor(b.color) } : b,
    ),
  )
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null)
  const [mode, setMode] = useState<SeatMode>('move')
  const [zoom, setZoom] = useState(1)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [seatEdit, setSeatEdit] = useState<SeatEdit | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /**
   * S3: the tracing underlay. A floor plan photo or PDF-export image sits
   * under the grid at low opacity so the organiser draws the REAL room.
   * Session-only by design: the image never persists into the chart (object
   * URL, revoked on replacement), so venue documents stay on the venue's
   * machine.
   */
  const [underlay, setUnderlay] = useState<{ url: string; opacity: number } | null>(null)
  const underlayInputRef = useRef<HTMLInputElement | null>(null)
  /** Colour-vision palette set: display-time only, shared with the buyer map. */
  const [paletteSet] = useSeatPaletteSet()

  function onUnderlayFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setUnderlay(prev => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { url: URL.createObjectURL(file), opacity: 0.3 }
    })
  }

  const layout = useMemo(() => generateLayout(blocks), [blocks])
  const issues = useMemo(() => validateLayout(layout), [layout])
  const selected = blocks.find(b => b.id === selectedId) ?? null

  // ── Undo history: a typed burst in one inspector field coalesces to one
  // step (keyed by block + fields edited); every discrete action is its own ──
  function pushHistory(editKey: string | null = null) {
    if (editKey !== null && lastEditKeyRef.current === editKey) return
    lastEditKeyRef.current = editKey
    historyRef.current.push(blocks.map(b => ({ ...b })))
    if (historyRef.current.length > 50) historyRef.current.shift()
    setCanUndo(true)
  }

  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    lastEditKeyRef.current = null
    setBlocks(prev)
    setCanUndo(historyRef.current.length > 0)
    setSeatEdit(null)
    setGuides({ x: null, y: null })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        undo()
      }
      if (e.key === 'Escape') setSeatEdit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Canvas viewport from content bounds.
  const view = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (const s of layout.sections) for (const r of s.rows) for (const seat of r.seats) { xs.push(seat.x); ys.push(seat.y) }
    for (const a of layout.areas) { xs.push(a.x, a.x + a.width); ys.push(a.y, a.y + a.height) }
    if (xs.length === 0) return { minX: 0, minY: 0, w: 640, h: 420 }
    const pad = 48
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad - 34 // stage band
    const w = Math.max(...xs) - minX + pad
    const h = Math.max(...ys) - minY + pad
    return { minX, minY, w, h }
  }, [layout])

  // Selection outline: one dashed gold bound around the selected block, the
  // design-tool convention, instead of a halo on every seat.
  const selectionBounds = useMemo(() => {
    if (!selectedId) return null
    const xs: number[] = []
    const ys: number[] = []
    for (const s of layout.sections)
      for (const r of s.rows)
        for (const seat of r.seats)
          if (seat.blockId === selectedId) { xs.push(seat.x); ys.push(seat.y) }
    if (xs.length === 0) return null
    const pad = SEAT_R + 6
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY }
  }, [layout, selectedId])

  function svgPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function updateBlock(id: string, patch: Partial<SeatBlock>) {
    setBlocks(prev => prev.map(b => (b.id === id ? ({ ...b, ...patch } as SeatBlock) : b)))
  }

  /** Inspector edits: one coalesced history step per field per block. */
  function editBlock(id: string, patch: Partial<SeatBlock>) {
    pushHistory(`edit:${id}:${Object.keys(patch).sort().join(',')}`)
    updateBlock(id, patch)
  }

  function onBlockPointerDown(e: React.PointerEvent, blockId: string) {
    setSelectedId(blockId)
    if (mode !== 'move') return
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    pushHistory()
    const p = svgPoint(e)
    dragRef.current = { blockId, startX: p.x, startY: p.y, originX: block.x, originY: block.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const p = svgPoint(e)
    // Snap to the 4px spacing base, then lock to a sibling block's axis when
    // within reach: the alignment guide flashes gold at the locked axis.
    let nx = Math.round((drag.originX + (p.x - drag.startX)) / SNAP_GRID) * SNAP_GRID
    let ny = Math.round((drag.originY + (p.y - drag.startY)) / SNAP_GRID) * SNAP_GRID
    let gx: number | null = null
    let gy: number | null = null
    for (const other of blocks) {
      if (other.id === drag.blockId) continue
      if (Math.abs(nx - other.x) <= ALIGN_SNAP) { nx = other.x; gx = other.x }
      if (Math.abs(ny - other.y) <= ALIGN_SNAP) { ny = other.y; gy = other.y }
    }
    setGuides({ x: gx, y: gy })
    updateBlock(drag.blockId, { x: nx, y: ny })
  }

  function onPointerUp() {
    dragRef.current = null
    setGuides({ x: null, y: null })
  }

  function onSeatClick(blockId: string, ref: string | undefined) {
    if (mode === 'move' || !ref) return
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.kind === 'area') return
    if (mode === 'blocked' || mode === 'accessible' || mode === 'companion' || mode === 'remove') {
      pushHistory()
    }
    if (mode === 'blocked') updateBlock(blockId, { blockedSeats: toggleRef(block.blockedSeats, ref) })
    if (mode === 'accessible') updateBlock(blockId, { accessibleSeats: toggleRef(block.accessibleSeats, ref) })
    if (mode === 'companion') updateBlock(blockId, { companionSeats: toggleRef(block.companionSeats, ref) })
    if (mode === 'remove' && block.kind === 'rows') {
      updateBlock(blockId, { removedSeats: toggleRef(block.removedSeats, ref) })
    }
    if (mode === 'relabel') {
      setSeatEdit({
        blockId,
        ref,
        kind: 'relabel',
        value: block.labelOverrides?.[ref] ?? ref.split('-').pop() ?? '',
      })
    }
    if (mode === 'note') {
      setSeatEdit({ blockId, ref, kind: 'note', value: block.notes?.[ref] ?? '' })
    }
  }

  function applySeatEdit() {
    if (!seatEdit) return
    const block = blocks.find(b => b.id === seatEdit.blockId)
    if (!block || block.kind === 'area') { setSeatEdit(null); return }
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

  const TOOLS: Array<{ m: SeatMode; label: string; icon: React.ReactNode }> = [
    { m: 'move', label: 'Select and move', icon: <MousePointer2 className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'blocked', label: 'Toggle blocked', icon: <Ban className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'accessible', label: 'Toggle accessible', icon: <Accessibility className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'companion', label: 'Toggle companion', icon: <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'remove', label: 'Remove seat', icon: <Eraser className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'relabel', label: 'Relabel seat', icon: <Tag className="h-3.5 w-3.5" aria-hidden /> },
    { m: 'note', label: 'Add note', icon: <StickyNote className="h-3.5 w-3.5" aria-hidden /> },
  ]

  const ADDERS: Array<{ kind: 'rows' | 'round' | 'square' | 'area'; label: string; icon: React.ReactNode }> = [
    { kind: 'rows', label: '+ Rows', icon: <Rows3 className="h-3.5 w-3.5" aria-hidden /> },
    { kind: 'round', label: '+ Round table', icon: <Circle className="h-3.5 w-3.5" aria-hidden /> },
    { kind: 'square', label: '+ Square table', icon: <Square className="h-3.5 w-3.5" aria-hidden /> },
    { kind: 'area', label: '+ Standing area', icon: <RectangleHorizontal className="h-3.5 w-3.5" aria-hidden /> },
  ]

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5">
      {/* Post-publish safety, stated where the editing happens: template
          edits never touch a live event until reviewed and applied there. */}
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
          {ADDERS.map(a => (
            <button
              key={a.kind}
              type="button"
              onClick={() => addBlock(a.kind)}
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar: seat tools + undo + live count ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink-400">Tool</span>
        <div className="flex flex-wrap gap-1 rounded-control border border-ink-200 bg-canvas p-1">
          {TOOLS.map(t => (
            <button
              key={t.m}
              type="button"
              onClick={() => { setMode(t.m); setSeatEdit(null) }}
              aria-pressed={mode === t.m}
              className={`inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                mode === t.m ? 'bg-ink-900 text-white' : 'bg-transparent text-ink-900 hover:bg-white'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Undo
        </button>

        {/* S3: trace a real floor plan. Session-only tracing aid. */}
        <input
          ref={underlayInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a floor plan image to trace"
          onChange={e => onUnderlayFile(e.target.files?.[0])}
        />
        {underlay ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-control border border-gold-500/50 bg-gold-500/10 px-3 text-xs font-semibold text-ink-900">
            <ImageUp className="h-3.5 w-3.5 text-gold-700" aria-hidden />
            Floor plan
            <input
              type="range"
              min={10}
              max={60}
              value={Math.round(underlay.opacity * 100)}
              aria-label="Floor plan visibility"
              onChange={e => setUnderlay(u => (u ? { ...u, opacity: Number(e.target.value) / 100 } : u))}
              className="h-1 w-20 accent-gold-500"
            />
            <button
              type="button"
              aria-label="Remove the floor plan underlay"
              onClick={() =>
                setUnderlay(prev => {
                  if (prev) URL.revokeObjectURL(prev.url)
                  return null
                })
              }
              className="flex h-5 w-5 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-white hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => underlayInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
          >
            <ImageUp className="h-3.5 w-3.5" aria-hidden />
            Trace a floor plan
          </button>
        )}
        <span className="ml-auto rounded-full border border-ink-200 bg-canvas px-3 py-1 text-xs font-semibold text-ink-900">
          {layout.totalSeats.toLocaleString()} seats{layout.areas.length > 0 ? ` + ${layout.areas.length} standing ${layout.areas.length === 1 ? 'zone' : 'zones'}` : ''}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── Canvas: the drafting table ── */}
        <div className="relative self-start">
          <div className="overflow-auto rounded-panel border border-ink-200 bg-canvas" style={{ maxHeight: 560, touchAction: 'none' }}>
            <svg
              ref={svgRef}
              viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
              style={{ width: `${100 * zoom}%`, minHeight: 380, display: 'block' }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              role="application"
              aria-label="Seating chart canvas"
            >
              {/* Drafting dot grid: the quiet paper under every serious tool */}
              <defs>
                <pattern id="builder-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1.2" cy="1.2" r="1.2" fill={INK_900} opacity="0.07" />
                </pattern>
                {/* The stage light: one signature across builder, buyer map,
                    kit preview. The good seats sit in the light. */}
                <radialGradient id="builder-stage-light" cx="0.5" cy="0" r="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity="0.13" />
                  <stop offset="55%" stopColor={GOLD} stopOpacity="0.045" />
                  <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* S3: the floor plan underlay, beneath everything, so the
                  organiser traces the real room. */}
              {underlay && (
                <image
                  href={underlay.url}
                  x={view.minX}
                  y={view.minY + 40}
                  width={view.w}
                  height={view.h - 40}
                  opacity={underlay.opacity}
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                />
              )}

              <rect x={view.minX} y={view.minY} width={view.w} height={view.h} fill="url(#builder-dot-grid)" />

              {/* STAGE: navy proscenium with the gold footlight keyline, the
                  same language the buyer map carries */}
              <rect x={view.minX + 24} y={view.minY + 8} width={view.w - 48} height={24} rx={5} fill={INK_900} />
              <rect x={view.minX + 24} y={view.minY + 36} width={view.w - 48} height={2} rx={1} fill={GOLD} />
              <rect
                x={view.minX + 24}
                y={view.minY + 38}
                width={view.w - 48}
                height={Math.min(140, view.h * 0.35)}
                fill="url(#builder-stage-light)"
                style={{ pointerEvents: 'none' }}
                aria-hidden="true"
              />
              <text x={view.minX + view.w / 2} y={view.minY + 24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#FFFFFF" letterSpacing={4}>
                STAGE
              </text>

              {/* Standing areas */}
              {layout.areas.map(area => {
                const block = blocks.find(b => b.kind === 'area' && (b as AreaBlock).label === area.label && b.x === area.x && b.y === area.y)
                const isSelected = block?.id === selectedId
                const scenery = area.style === 'scenery'
                return (
                  <g
                    key={`${area.label}-${area.x}-${area.y}`}
                    onPointerDown={e => block && onBlockPointerDown(e, block.id)}
                    style={{ cursor: mode === 'move' ? 'grab' : 'default' }}
                  >
                    <rect
                      x={area.x} y={area.y} width={area.width} height={area.height} rx={10}
                      fill={scenery ? INK_900 : sectionColorForSet(area.color, paletteSet)}
                      fillOpacity={scenery ? 0.07 : 0.13}
                      stroke={isSelected ? GOLD : scenery ? '#9CA3AF' : sectionColorForSet(area.color, paletteSet)}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={scenery ? undefined : '6 4'}
                    />
                    <text x={area.x + area.width / 2} y={area.y + area.height / 2 - 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK_900}>
                      {area.label}
                    </text>
                    {!scenery && (
                      <text x={area.x + area.width / 2} y={area.y + area.height / 2 + 12} textAnchor="middle" fontSize={10} fill="#4A4A4A">
                        {area.capacity ? `${area.capacity} standing` : 'Standing'}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Seats: section colour with a soft keyline and the numeral;
                  blocked strikes through; accessible rings white */}
              {layout.sections.map(section =>
                section.rows.map(row =>
                  row.seats.map(seat => {
                    const isEditTarget = seatEdit?.blockId === seat.blockId && seatEdit?.ref === seat.ref
                    const blocked = !!seat.blocked
                    return (
                      <g key={`${section.name}-${row.label}-${seat.number}-${seat.x}-${seat.y}`}>
                        <circle
                          cx={seat.x}
                          cy={seat.y}
                          r={SEAT_R}
                          fill={blocked ? '#374151' : sectionColorForSet(section.color, paletteSet)}
                          stroke={isEditTarget ? GOLD : seat.type === 'accessible' ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                          strokeWidth={isEditTarget ? 2.5 : seat.type === 'accessible' ? 2 : 1}
                          onPointerDown={e => seat.blockId && onBlockPointerDown(e, seat.blockId)}
                          onClick={() => onSeatClick(seat.blockId ?? '', seat.ref)}
                          style={{ cursor: mode === 'move' ? 'grab' : 'pointer' }}
                        />
                        {blocked ? (
                          <line x1={seat.x - 4} y1={seat.y + 4} x2={seat.x + 4} y2={seat.y - 4} stroke="#FFFFFF" strokeWidth={1.5} pointerEvents="none" />
                        ) : seat.type === 'accessible' ? (
                          <text x={seat.x} y={seat.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF" pointerEvents="none">A</text>
                        ) : seat.type === 'companion' ? (
                          <text x={seat.x} y={seat.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF" pointerEvents="none">C</text>
                        ) : (
                          <text x={seat.x} y={seat.y + 2.8} textAnchor="middle" fontSize={6.5} fontWeight={600} fill="#FFFFFF" pointerEvents="none">
                            {seat.number}
                          </text>
                        )}
                      </g>
                    )
                  })
                )
              )}

              {/* Selection outline: one dashed gold bound around the block */}
              {selectionBounds && (
                <rect
                  x={selectionBounds.x} y={selectionBounds.y}
                  width={selectionBounds.w} height={selectionBounds.h}
                  rx={10} fill="none" stroke={GOLD} strokeWidth={1.5}
                  strokeDasharray="6 5" pointerEvents="none"
                />
              )}

              {/* Alignment guides: gold hairlines while a drag is locked */}
              {guides.x !== null && (
                <line x1={guides.x} y1={view.minY} x2={guides.x} y2={view.minY + view.h} stroke={GOLD} strokeWidth={1} strokeDasharray="4 4" pointerEvents="none" />
              )}
              {guides.y !== null && (
                <line x1={view.minX} y1={guides.y} x2={view.minX + view.w} y2={guides.y} stroke={GOLD} strokeWidth={1} strokeDasharray="4 4" pointerEvents="none" />
              )}
            </svg>
          </div>

          {/* The empty canvas is an invitation, never a blank grid: the
              stage is lit, the first block is one tap away. */}
          {blocks.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto mx-4 max-w-sm rounded-2xl border border-ink-200 bg-white/95 p-6 text-center shadow-lg">
                <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
                  The room studio
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-ink-900">Draw your room</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-600">
                  The stage is set. Lay your first rows, tables or standing
                  zone, or trace the real floor plan and build over it.
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
                    onClick={() => addBlock('round')}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
                  >
                    <Circle className="h-3.5 w-3.5" aria-hidden />
                    Seat a table
                  </button>
                  <button
                    type="button"
                    onClick={() => underlayInputRef.current?.click()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
                  >
                    <ImageUp className="h-3.5 w-3.5" aria-hidden />
                    Trace a plan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* The live bow slider, on the lit canvas: drag it and watch the
              rows arc in place. Manual mode bows the front row; auto mode
              tightens the arc around the stage. */}
          {selected && selected.kind === 'rows' && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-sm">
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
              <span
                className="min-w-9 text-right text-[11px] font-semibold text-ink-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {(selected as RowsBlock).autoBow
                  ? `${Math.round(((400 - Math.min(400, Math.max(60, (selected as RowsBlock).focalRise ?? 160))) / 340) * 100)}%`
                  : `${(selected as RowsBlock).curveDepth ?? 0}px`}
              </span>
            </div>
          )}

          {/* Floating zoom controls, the buyer-map cluster */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-ink-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              disabled={zoom <= 0.5}
              className="flex h-9 w-9 items-center justify-center rounded-l-lg text-ink-600 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(2, +(z + 0.25).toFixed(2)))}
              disabled={zoom >= 2}
              className="flex h-9 w-9 items-center justify-center text-ink-600 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="h-6 w-px bg-ink-200" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="flex h-9 items-center gap-1 rounded-r-lg px-2.5 text-[11px] font-semibold text-ink-600 transition-colors hover:bg-ink-100"
              aria-label="Zoom to fit"
            >
              <Maximize className="h-3 w-3" aria-hidden />
              Fit
            </button>
          </div>
        </div>

        {/* ── Inspector ── */}
        <div className="space-y-4">
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
                  onKeyDown={e => { if (e.key === 'Enter') applySeatEdit() }}
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
            />
          ) : (
            <p className="rounded-panel border border-ink-200 bg-canvas p-4 text-sm text-ink-600">
              Add a block, or select one on the canvas to edit its rows, seats,
              numbering, curve and rotation.
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
          {message && <p aria-live="polite" className="text-sm text-ink-700">{message}</p>}
        </div>
      </div>
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

function BlockConfig({
  block,
  onChange,
  onDuplicate,
  onDelete,
}: {
  block: SeatBlock
  onChange: (patch: Partial<SeatBlock>) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3 rounded-panel border border-ink-200 bg-canvas p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-ink-900">
          {block.kind === 'rows' ? 'Rows block' : block.kind === 'table' ? `${(block as TableBlock).shape === 'round' ? 'Round' : 'Square'} table` : 'Standing area'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onDuplicate} className="text-xs font-semibold text-ink-600 hover:text-ink-900">Duplicate</button>
          <button type="button" onClick={onDelete} className="text-xs font-semibold text-error hover:underline">Delete</button>
        </div>
      </div>

      <Field label="Section name">
        <input className={inputClass} value={block.section} onChange={e => onChange({ section: e.target.value })} />
      </Field>
      <Field label="Ticket tier (bound by name at event attach)">
        <input className={inputClass} value={block.tierName ?? ''} placeholder="e.g. A Reserve" onChange={e => onChange({ tierName: e.target.value || undefined })} />
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

      {block.kind === 'rows' && <RowsConfig block={block as RowsBlock} onChange={onChange} />}
      {block.kind === 'table' && <TableConfig block={block as TableBlock} onChange={onChange} />}
      {block.kind === 'area' && <AreaConfig block={block as AreaBlock} onChange={onChange} />}
    </div>
  )
}

function RowsConfig({ block, onChange }: { block: RowsBlock; onChange: (p: Partial<RowsBlock>) => void }) {
  const perRowText = Array.isArray(block.seatsPerRow) ? block.seatsPerRow.join(', ') : String(block.seatsPerRow)
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rows">
          <input type="number" min={1} className={inputClass} value={block.rows}
            onChange={e => onChange({ rows: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <Field label="Row labels">
          <select className={inputClass} value={block.rowLabelScheme ?? 'alpha'}
            onChange={e => onChange({ rowLabelScheme: e.target.value as 'alpha' | 'numeric' })}>
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
            const parts = e.target.value.split(',').map(p => Number(p.trim())).filter(n => Number.isFinite(n) && n >= 0)
            if (parts.length === 0) return
            onChange({ seatsPerRow: parts.length === 1 ? parts[0] : parts, rows: parts.length === 1 ? block.rows : parts.length })
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First row label">
          <input className={inputClass} value={String(block.rowLabelStart ?? ((block.rowLabelScheme ?? 'alpha') === 'alpha' ? 'A' : 1))}
            onChange={e => onChange({ rowLabelStart: e.target.value })} />
        </Field>
        <Field label="First seat number">
          <input type="number" className={inputClass} value={block.seatStart ?? 1}
            onChange={e => onChange({ seatStart: Number(e.target.value) || 1 })} />
        </Field>
        <Field label="Rotation (degrees)">
          <input type="number" className={inputClass} value={block.rotation ?? 0}
            onChange={e => onChange({ rotation: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Row alignment (uneven rows)">
          <select className={inputClass} value={block.align ?? 'left'}
            onChange={e => onChange({ align: e.target.value as 'left' | 'centre' })}>
            <option value="left">Left-anchored</option>
            <option value="centre">Centred (theatre)</option>
          </select>
        </Field>
      </div>

      {/* The curve group: auto-bow arcs every row around the stage the way
          a real room rakes; manual mode shapes the bow front to back, and
          row by row when the room demands it. */}
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
          <Field label={`Curve tightness · rows arc around the stage`}>
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
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-semibold text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                <span className="underline decoration-gold-500 decoration-2 underline-offset-2">
                  Shape row by row
                </span>
                {Object.keys(block.rowCurveOverrides ?? {}).length > 0 && (
                  <span className="ml-1.5 text-ink-400">
                    {Object.keys(block.rowCurveOverrides ?? {}).length} shaped
                  </span>
                )}
              </summary>
              <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {Array.from({ length: Math.min(block.rows, 60) }, (_, r) => {
                  const scheme = block.rowLabelScheme ?? 'alpha'
                  const label = scheme === 'alpha'
                    ? String.fromCharCode(65 + (r % 26))
                    : String((Number(block.rowLabelStart) || 1) + r)
                  const override = block.rowCurveOverrides?.[String(r)]
                  return (
                    <div key={r} className="flex items-center gap-2">
                      <span
                        className="w-7 shrink-0 text-right text-[11px] font-semibold text-ink-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {label}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={80}
                        step={2}
                        value={override ?? ''}
                        aria-label={`Bow for row ${label}`}
                        onChange={e => {
                          const next = { ...(block.rowCurveOverrides ?? {}) }
                          next[String(r)] = Math.max(0, Number(e.target.value) || 0)
                          onChange({ rowCurveOverrides: next })
                        }}
                        className="h-1 w-full accent-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                      />
                      {override != null && (
                        <button
                          type="button"
                          aria-label={`Clear the bow override for row ${label}`}
                          onClick={() => {
                            const next = { ...(block.rowCurveOverrides ?? {}) }
                            delete next[String(r)]
                            onChange({ rowCurveOverrides: next })
                          }}
                          className="shrink-0 text-[11px] font-semibold text-ink-400 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </details>
          </>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-900">
        <input type="checkbox" checked={block.reverseSeats ?? false}
          onChange={e => onChange({ reverseSeats: e.target.checked })} />
        Reverse seat numbering
      </label>
    </>
  )
}

function TableConfig({ block, onChange }: { block: TableBlock; onChange: (p: Partial<TableBlock>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Table label">
          <input className={inputClass} value={block.label} onChange={e => onChange({ label: e.target.value })} />
        </Field>
        <Field label="Seats">
          <input type="number" min={1} className={inputClass} value={block.seats}
            onChange={e => onChange({ seats: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <Field label="Seat labels">
          <select className={inputClass} value={block.seatLabelScheme ?? 'numeric'}
            onChange={e => onChange({ seatLabelScheme: e.target.value as 'alpha' | 'numeric' })}>
            <option value="numeric">1, 2, 3</option>
            <option value="alpha">A, B, C</option>
          </select>
        </Field>
        <Field label="Rotation (degrees)">
          <input type="number" className={inputClass} value={block.rotation ?? 0}
            onChange={e => onChange({ rotation: Number(e.target.value) || 0 })} />
        </Field>
      </div>
    </>
  )
}

function AreaConfig({ block, onChange }: { block: AreaBlock; onChange: (p: Partial<AreaBlock>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Zone label">
          <input className={inputClass} value={block.label} onChange={e => onChange({ label: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={block.style ?? 'zone'}
            onChange={e => onChange({ style: e.target.value as 'zone' | 'scenery' })}>
            <option value="zone">Standing zone (sells via tier)</option>
            <option value="scenery">Scenery (bar, exit, mixer)</option>
          </select>
        </Field>
        <Field label="Capacity (sold via the tier)">
          <input type="number" min={0} className={inputClass} value={block.capacity ?? 0}
            disabled={block.style === 'scenery'}
            onChange={e => onChange({ capacity: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label="Width (px)">
          <input type="number" min={40} className={inputClass} value={block.width}
            onChange={e => onChange({ width: Math.max(40, Number(e.target.value) || 40) })} />
        </Field>
        <Field label="Height (px)">
          <input type="number" min={30} className={inputClass} value={block.height}
            onChange={e => onChange({ height: Math.max(30, Number(e.target.value) || 30) })} />
        </Field>
      </div>
    </>
  )
}
