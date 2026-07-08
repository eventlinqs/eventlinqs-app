'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  generateLayout,
  validateLayout,
  type AreaBlock,
  type RowsBlock,
  type SeatBlock,
  type TableBlock,
} from '@/lib/seating/generate'
import { saveSeatMap } from './actions'

/**
 * Visual seat-map builder. The organiser composes blocks (row blocks, round
 * and square tables, standing areas), drags them into place on the canvas,
 * and edits per-block numbering, counts, curve and rotation in the panel.
 * Seat-level marking (blocked, accessible, companion, remove, relabel) is a
 * click mode: pick the tool, click seats. Preview and save run the SAME pure
 * generator, so what the organiser sees is exactly what materialises.
 */

type SeatMode = 'move' | 'blocked' | 'accessible' | 'companion' | 'remove'

const SECTION_COLORS = [
  '#0EA5E9', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0',
  '#00BCD4', '#F44336', '#3F51B5', '#8BC34A', '#FF5722',
]

const SEAT_R = 9

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

export function SeatMapBuilder({ venueId, seatMapId, initialName, initialBlocks, onClose }: Props) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ blockId: string; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const [name, setName] = useState(initialName)
  const [blocks, setBlocks] = useState<SeatBlock[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null)
  const [mode, setMode] = useState<SeatMode>('move')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const layout = useMemo(() => generateLayout(blocks), [blocks])
  const issues = useMemo(() => validateLayout(layout), [layout])
  const selected = blocks.find(b => b.id === selectedId) ?? null

  // Canvas viewport from content bounds.
  const view = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (const s of layout.sections) for (const r of s.rows) for (const seat of r.seats) { xs.push(seat.x); ys.push(seat.y) }
    for (const a of layout.areas) { xs.push(a.x, a.x + a.width); ys.push(a.y, a.y + a.height) }
    if (xs.length === 0) return { minX: 0, minY: 0, w: 640, h: 420 }
    const pad = 48
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad - 30 // stage band
    const w = Math.max(...xs) - minX + pad
    const h = Math.max(...ys) - minY + pad
    return { minX, minY, w, h }
  }, [layout])

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

  function onBlockPointerDown(e: React.PointerEvent, blockId: string) {
    setSelectedId(blockId)
    if (mode !== 'move') return
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    const p = svgPoint(e)
    dragRef.current = { blockId, startX: p.x, startY: p.y, originX: block.x, originY: block.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const p = svgPoint(e)
    updateBlock(drag.blockId, {
      x: Math.round(drag.originX + (p.x - drag.startX)),
      y: Math.round(drag.originY + (p.y - drag.startY)),
    })
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function onSeatClick(blockId: string, ref: string | undefined) {
    if (mode === 'move' || !ref) return
    const block = blocks.find(b => b.id === blockId)
    if (!block || block.kind === 'area') return
    if (mode === 'blocked') updateBlock(blockId, { blockedSeats: toggleRef(block.blockedSeats, ref) })
    if (mode === 'accessible') updateBlock(blockId, { accessibleSeats: toggleRef(block.accessibleSeats, ref) })
    if (mode === 'companion') updateBlock(blockId, { companionSeats: toggleRef(block.companionSeats, ref) })
    if (mode === 'remove' && block.kind === 'rows') {
      updateBlock(blockId, { removedSeats: toggleRef(block.removedSeats, ref) })
    }
  }

  function addBlock(kind: 'rows' | 'round' | 'square' | 'area') {
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

  const seatFill = (sectionColor: string, type: string, blocked?: boolean): string => {
    if (blocked) return '#374151'
    return sectionColor
  }

  const modeButton = (m: SeatMode, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-control px-3 py-2 text-xs font-semibold transition-colors ${
        mode === m ? 'bg-ink-900 text-white' : 'bg-white text-ink-900 border border-ink-200 hover:border-ink-900'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="rounded-card border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          aria-label="Seating chart name"
          className="h-11 w-full max-w-xs rounded-control border border-ink-200 px-3 font-display text-base font-bold text-ink-900"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => addBlock('rows')} className="rounded-control border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 hover:border-ink-900">+ Rows</button>
          <button type="button" onClick={() => addBlock('round')} className="rounded-control border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 hover:border-ink-900">+ Round table</button>
          <button type="button" onClick={() => addBlock('square')} className="rounded-control border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 hover:border-ink-900">+ Square table</button>
          <button type="button" onClick={() => addBlock('area')} className="rounded-control border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 hover:border-ink-900">+ Standing area</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">Tool</span>
        {modeButton('move', 'Select and move')}
        {modeButton('blocked', 'Toggle blocked')}
        {modeButton('accessible', 'Toggle accessible')}
        {modeButton('companion', 'Toggle companion')}
        {modeButton('remove', 'Remove seat')}
        <span className="ml-auto text-sm text-ink-600">
          {layout.totalSeats} seats{layout.areas.length > 0 ? ` + ${layout.areas.length} standing ${layout.areas.length === 1 ? 'zone' : 'zones'}` : ''}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <div className="overflow-auto rounded-panel border border-ink-200 bg-canvas" style={{ maxHeight: 560, touchAction: 'none' }}>
          <svg
            ref={svgRef}
            viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
            className="h-auto w-full"
            style={{ minHeight: 380 }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="application"
            aria-label="Seating chart canvas"
          >
            {/* Stage marker */}
            <rect x={view.minX + 24} y={view.minY + 8} width={view.w - 48} height={22} rx={4} fill="#0A1628" />
            <text x={view.minX + view.w / 2} y={view.minY + 23} textAnchor="middle" fontSize={11} fontWeight={700} fill="#FFFFFF" letterSpacing={3}>
              STAGE
            </text>

            {/* Standing areas */}
            {layout.areas.map(area => {
              const block = blocks.find(b => b.kind === 'area' && (b as AreaBlock).label === area.label && b.x === area.x && b.y === area.y)
              const isSelected = block?.id === selectedId
              return (
                <g
                  key={`${area.label}-${area.x}-${area.y}`}
                  onPointerDown={e => block && onBlockPointerDown(e, block.id)}
                  style={{ cursor: mode === 'move' ? 'grab' : 'default' }}
                >
                  <rect
                    x={area.x} y={area.y} width={area.width} height={area.height} rx={10}
                    fill={area.color} fillOpacity={0.18}
                    stroke={isSelected ? '#0A1628' : area.color} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray="6 4"
                  />
                  <text x={area.x + area.width / 2} y={area.y + area.height / 2 - 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0A1628">
                    {area.label}
                  </text>
                  <text x={area.x + area.width / 2} y={area.y + area.height / 2 + 12} textAnchor="middle" fontSize={10} fill="#4A4A4A">
                    {area.capacity ? `${area.capacity} standing` : 'Standing'}
                  </text>
                </g>
              )
            })}

            {/* Seats */}
            {layout.sections.map(section =>
              section.rows.map(row =>
                row.seats.map(seat => {
                  const isSelectedBlock = seat.blockId === selectedId
                  return (
                    <g key={`${section.name}-${row.label}-${seat.number}-${seat.x}-${seat.y}`}>
                      <circle
                        cx={seat.x}
                        cy={seat.y}
                        r={SEAT_R}
                        fill={seatFill(section.color, seat.type, seat.blocked)}
                        stroke={isSelectedBlock ? '#0A1628' : seat.type === 'accessible' ? '#FFFFFF' : 'transparent'}
                        strokeWidth={isSelectedBlock ? 2 : seat.type === 'accessible' ? 2 : 0}
                        onPointerDown={e => seat.blockId && onBlockPointerDown(e, seat.blockId)}
                        onClick={() => onSeatClick(seat.blockId ?? '', seat.ref)}
                        style={{ cursor: mode === 'move' ? 'grab' : 'pointer' }}
                      />
                      {seat.type === 'accessible' && (
                        <text x={seat.x} y={seat.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF" pointerEvents="none">A</text>
                      )}
                      {seat.type === 'companion' && (
                        <text x={seat.x} y={seat.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF" pointerEvents="none">C</text>
                      )}
                    </g>
                  )
                })
              )
            )}
          </svg>
        </div>

        {/* Block config */}
        <div className="space-y-4">
          {selected ? (
            <BlockConfig
              block={selected}
              onChange={patch => updateBlock(selected.id, patch)}
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
  'h-10 w-full rounded-control border border-ink-200 bg-white px-2.5 text-sm text-ink-900'

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
              className="h-7 w-7 rounded-full border-2"
              style={{ background: c, borderColor: block.color === c ? '#0A1628' : 'transparent' }}
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
        <Field label="Capacity (sold via the tier)">
          <input type="number" min={0} className={inputClass} value={block.capacity ?? 0}
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
