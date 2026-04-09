'use client'

import { useState, useTransition, useMemo } from 'react'
import { createSeatReservation } from '@/app/actions/seat-reservations'

export interface SeatData {
  id: string
  row_label: string
  seat_number: string
  seat_type: string
  status: string
  x: number
  y: number
  price_cents: number | null
  seat_map_section_id: string | null
}

export interface SectionData {
  id: string
  name: string
  color: string
}

interface Props {
  eventId: string
  seats: SeatData[]
  sections: SectionData[]
  defaultPriceCents: number
  currency: string
  maxPerOrder: number
}

const STATUS_FILL: Record<string, { fill: string; stroke: string; clickable: boolean }> = {
  available: { fill: 'var(--section-color)', stroke: 'transparent', clickable: true },
  selected: { fill: '#1A1A2E', stroke: '#4A90D9', clickable: true },
  reserved: { fill: '#9CA3AF', stroke: 'transparent', clickable: false },
  sold: { fill: '#6B7280', stroke: 'transparent', clickable: false },
  held: { fill: '#9CA3AF', stroke: 'transparent', clickable: false },
  blocked: { fill: '#374151', stroke: 'transparent', clickable: false },
  accessible: { fill: 'var(--section-color)', stroke: '#FFFFFF', clickable: true },
}

const SEAT_SIZE = 20
const PADDING = 28

export function SeatSelector({
  eventId,
  seats,
  sections,
  defaultPriceCents,
  currency,
  maxPerOrder,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const sectionColorMap = useMemo(
    () => new Map(sections.map(s => [s.id, s.color])),
    [sections]
  )

  // Compute SVG viewport from seat coordinates
  const { minX, minY, viewWidth, viewHeight } = useMemo(() => {
    if (seats.length === 0) return { minX: 0, minY: 0, viewWidth: 400, viewHeight: 300 }
    const xs = seats.map(s => s.x)
    const ys = seats.map(s => s.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      minX,
      minY,
      viewWidth: maxX - minX + SEAT_SIZE + PADDING * 2,
      viewHeight: maxY - minY + SEAT_SIZE + PADDING * 2,
    }
  }, [seats])

  function toggleSeat(seat: SeatData) {
    const style = STATUS_FILL[seat.status] ?? STATUS_FILL.sold
    if (!style.clickable) return

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(seat.id)) {
        next.delete(seat.id)
      } else {
        if (next.size >= maxPerOrder) return prev // respect max per order
        next.add(seat.id)
      }
      return next
    })
  }

  function pickBestAvailable(n: number) {
    const available = seats.filter(s => s.status === 'available' && !selectedIds.has(s.id))
    if (available.length === 0) return

    // Group by section+row, then find longest contiguous run
    type Key = string
    const rows = new Map<Key, SeatData[]>()
    for (const seat of available) {
      const key = `${seat.seat_map_section_id ?? 'none'}::${seat.row_label}`
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key)!.push(seat)
    }

    let bestRun: SeatData[] = []

    for (const rowSeats of rows.values()) {
      const sorted = [...rowSeats].sort((a, b) => a.x - b.x)
      // Find longest contiguous run of length >= n
      let run: SeatData[] = [sorted[0]]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].x - sorted[i - 1].x <= SEAT_SIZE + 2) {
          run.push(sorted[i])
        } else {
          if (run.length >= n && run.length > bestRun.length) bestRun = run.slice(0, n)
          run = [sorted[i]]
        }
      }
      if (run.length >= n && run.length > bestRun.length) bestRun = run.slice(0, n)
    }

    // Fallback: just pick first N available in same section
    if (bestRun.length === 0) {
      bestRun = available
        .sort((a, b) => {
          const sectionCmp = (a.seat_map_section_id ?? '').localeCompare(b.seat_map_section_id ?? '')
          if (sectionCmp !== 0) return sectionCmp
          const rowCmp = a.row_label.localeCompare(b.row_label)
          if (rowCmp !== 0) return rowCmp
          return a.x - b.x
        })
        .slice(0, n)
    }

    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const s of bestRun) {
        if (next.size >= maxPerOrder) break
        next.add(s.id)
      }
      return next
    })
  }

  const selectedSeats = seats.filter(s => selectedIds.has(s.id))
  const totalCents = selectedSeats.reduce(
    (sum, s) => sum + (s.price_cents ?? defaultPriceCents),
    0
  )

  function formatPrice(cents: number) {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }

  function handleProceed() {
    if (selectedIds.size === 0) return
    setError(null)
    startTransition(async () => {
      const result = await createSeatReservation({
        event_id: eventId,
        seat_ids: Array.from(selectedIds),
      })
      if (result.error) {
        setError(result.error)
        // Clear any now-unavailable seats from selection
        return
      }
      if (result.reservation_id) {
        window.location.href = `/checkout/${result.reservation_id}?seat=1`
      }
    })
  }

  const hovered = hoveredId ? seats.find(s => s.id === hoveredId) : null

  if (seats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
        Seats are not yet available for this event.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-blue-500" />
          <span className="text-gray-600">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-gray-900" style={{ outline: '2px solid #4A90D9', outlineOffset: '1px' }} />
          <span className="text-gray-600">Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-gray-400" />
          <span className="text-gray-600">Unavailable</span>
        </div>
        {sections.map(s => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600">{s.name}</span>
          </div>
        ))}
      </div>

      {/* Seat map SVG */}
      <div className="overflow-auto rounded-lg border border-gray-200 bg-gray-50">
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          style={{ width: '100%', minWidth: `${Math.min(viewWidth, 900)}px`, display: 'block' }}
          role="img"
          aria-label="Seat map"
        >
          {/* Stage label */}
          <rect x={PADDING} y={4} width={viewWidth - PADDING * 2} height={16} rx="3" fill="#E5E7EB" />
          <text x={viewWidth / 2} y={15} textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="500">
            STAGE / FRONT
          </text>

          {seats.map(seat => {
            const cx = seat.x - minX + PADDING + SEAT_SIZE / 2
            const cy = seat.y - minY + PADDING + SEAT_SIZE / 2
            const isSelected = selectedIds.has(seat.id)
            const isHovered = hoveredId === seat.id
            const effectiveStatus = isSelected ? 'selected' : seat.status
            const styleInfo = STATUS_FILL[effectiveStatus] ?? STATUS_FILL.sold
            const sectionColor = sectionColorMap.get(seat.seat_map_section_id ?? '') ?? '#4A90D9'

            const fill = styleInfo.fill.replace('var(--section-color)', sectionColor)

            return (
              <g
                key={seat.id}
                style={{ cursor: styleInfo.clickable ? 'pointer' : 'not-allowed' }}
                onClick={() => toggleSeat(seat)}
                onMouseEnter={() => setHoveredId(seat.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <rect
                  x={cx - SEAT_SIZE / 2}
                  y={cy - SEAT_SIZE / 2}
                  width={SEAT_SIZE}
                  height={SEAT_SIZE}
                  rx="3"
                  fill={fill}
                  stroke={isHovered && styleInfo.clickable ? '#4A90D9' : styleInfo.stroke}
                  strokeWidth={isSelected ? 2 : 1}
                  opacity={styleInfo.clickable ? 1 : 0.5}
                />
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize="7"
                  fill="white"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {seat.seat_number}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Tooltip for hovered seat */}
      {hovered && (
        <div className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white">
          Row {hovered.row_label} · Seat {hovered.seat_number} ·{' '}
          {hovered.seat_type !== 'standard' && <span className="capitalize">{hovered.seat_type} · </span>}
          {hovered.status === 'available'
            ? formatPrice(hovered.price_cents ?? defaultPriceCents)
            : hovered.status === 'reserved'
            ? 'Being reserved'
            : 'Unavailable'}
        </div>
      )}

      {/* Best available */}
      {[1, 2, 3, 4, 5, 6, 8, 10].filter(n => n <= maxPerOrder).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-700">Best available:</span>
          {[1, 2, 3, 4, 5, 6, 8, 10]
            .filter(n => n <= maxPerOrder)
            .map(n => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setSelectedIds(new Set())
                  pickBestAvailable(n)
                }}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {n}
              </button>
            ))}
        </div>
      )}

      {/* Selection summary + proceed */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {selectedIds.size === 0 ? (
          <p className="text-sm text-gray-500 text-center">
            Click seats on the map to select them
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              {selectedSeats.map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    Row {s.row_label} · Seat {s.seat_number}
                    {s.seat_type !== 'standard' && (
                      <span className="ml-1 text-xs text-gray-400 capitalize">({s.seat_type})</span>
                    )}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatPrice(s.price_cents ?? defaultPriceCents)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{selectedIds.size} seat{selectedIds.size !== 1 ? 's' : ''}</p>
                <p className="text-base font-bold text-gray-900">{formatPrice(totalCents)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
                <button
                  type="button"
                  onClick={() => { setError(null); setSelectedIds(new Set()) }}
                  className="ml-2 underline text-xs"
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleProceed}
          disabled={selectedIds.size === 0 || isPending}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? 'Reserving seats…'
            : selectedIds.size === 0
            ? 'Select seats to continue'
            : `Reserve ${selectedIds.size} seat${selectedIds.size !== 1 ? 's' : ''} — ${formatPrice(totalCents)}`}
        </button>
      </div>
    </div>
  )
}
