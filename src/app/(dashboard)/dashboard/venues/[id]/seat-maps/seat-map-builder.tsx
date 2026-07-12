'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Accessibility,
  Ban,
  Circle,
  Eraser,
  HeartHandshake,
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
} from 'lucide-react'
import {
  generateLayout,
  validateLayout,
  type AreaBlock,
  type RowsBlock,
  type SeatBlock,
  type TableBlock,
} from '@/lib/seating/generate'
import { SECTION_COLORS, editorialSectionColor } from '@/lib/seating/palette'
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
  onClose: () => void
}

interface SeatEdit {
  blockId: string
  ref: string
  kind: 'relabel' | 'note'
  value: string
}

export function SeatMapBuilder({ venueId, seatMapId, initialName, initialBlocks, onClose }: Props) {
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
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500"
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
              className={`inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 transition-colors hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Undo
        </button>
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
              </defs>
              <rect x={view.minX} y={view.minY} width={view.w} height={view.h} fill="url(#builder-dot-grid)" />

              {/* STAGE: navy proscenium with the gold footlight keyline, the
                  same language the buyer map carries */}
              <rect x={view.minX + 24} y={view.minY + 8} width={view.w - 48} height={24} rx={5} fill={INK_900} />
              <rect x={view.minX + 24} y={view.minY + 36} width={view.w - 48} height={2} rx={1} fill={GOLD} />
              <text x={view.minX + view.w / 2} y={view.minY + 24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#FFFFFF" letterSpacing={4}>
                STAGE
              </text>

              {blocks.length === 0 && (
                <text x={view.minX + view.w / 2} y={view.minY + view.h / 2} textAnchor="middle" fontSize={13} fill="#6B7280">
                  Add rows, tables or a standing zone to begin drawing the room
                </text>
              )}

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
                      fill={scenery ? INK_900 : area.color}
                      fillOpacity={scenery ? 0.07 : 0.13}
                      stroke={isSelected ? GOLD : scenery ? '#9CA3AF' : area.color}
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
                          fill={blocked ? '#374151' : section.color}
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
        <Field label="Curve depth (px)">
          <input type="number" min={0} className={inputClass} value={block.curveDepth ?? 0}
            onChange={e => onChange({ curveDepth: Math.max(0, Number(e.target.value) || 0) })} />
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
