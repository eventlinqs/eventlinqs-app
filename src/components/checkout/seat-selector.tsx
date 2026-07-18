'use client'

import { useState, useTransition, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  ticket_tier_id: string | null
}

export interface SectionData {
  id: string
  name: string
  color: string
}

/** Standing/GA zone drawn on the chart. Display-only here: these sell
 *  through their bound tier's normal capacity, never as seats. */
export interface SeatAreaData {
  label: string
  section: string
  tier_name?: string
  color: string
  x: number
  y: number
  width: number
  height: number
  capacity?: number
  /** 'zone' (default, sells via its GA tier) or 'scenery' (annotation only). */
  style?: 'zone' | 'scenery'
}

interface Props {
  eventId: string
  seats: SeatData[]
  sections: SectionData[]
  areas?: SeatAreaData[]
  defaultPriceCents: number
  currency: string
  maxPerOrder: number
  tierPriceCentsMap?: Record<string, number>
}

// Brand tokens (referenced inline from the SVG where className is not available)
const GOLD = '#D4A017'         // --color-gold-500
const INK_900 = '#0A1628'      // --color-ink-900
const INK_200 = '#D9D9D6'      // --color-ink-200 (unavailable seats: quiet, not alarming)
const INK_400 = '#6B7280'      // --color-ink-400

// Premium treatment: available seats carry their section colour with a soft
// white keyline; the SELECTED state is the brand moment (gold seat, navy
// numeral); everything unavailable recedes to the same quiet ink so the open
// room reads instantly. Text colour is part of the state.
const STATUS_FILL: Record<
  string,
  { fill: string; stroke: string; text: string; clickable: boolean }
> = {
  available:  { fill: 'var(--section-color)', stroke: 'rgba(255,255,255,0.55)', text: '#FFFFFF', clickable: true },
  selected:   { fill: GOLD,                    stroke: INK_900,                   text: INK_900,  clickable: true },
  reserved:   { fill: INK_200,                 stroke: 'transparent',             text: INK_400,  clickable: false },
  sold:       { fill: INK_200,                 stroke: 'transparent',             text: INK_400,  clickable: false },
  held:       { fill: INK_200,                 stroke: 'transparent',             text: INK_400,  clickable: false },
  blocked:    { fill: INK_200,                 stroke: 'transparent',             text: INK_400,  clickable: false },
  accessible: { fill: 'var(--section-color)', stroke: '#FFFFFF',                 text: '#FFFFFF', clickable: true },
}

const SEAT_SIZE = 20
const PADDING = 28
const ROW_LABEL_GUTTER = 24   // space reserved on the left for row letters
const STAGE_BAND = 44         // space reserved at the top for STAGE label

export function SeatSelector({
  eventId,
  seats,
  sections,
  areas = [],
  defaultPriceCents,
  currency,
  maxPerOrder,
  tierPriceCentsMap = {},
}: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Primitive keys: only recompute memos when content changes, not on every array reference change
  const seatsKey = seats.map(s => `${s.id}:${s.status}`).join('|')
  const sectionsKey = sections.map(s => `${s.id}:${s.color}:${s.name}`).join('|')
  const areasKey = areas.map(a => `${a.label}:${a.x}:${a.y}:${a.width}:${a.height}`).join('|')
  const selectedIdsKey = [...selectedIds].sort().join(',')

  const sectionColorMap = useMemo(
    () => new Map(sections.map(s => [s.id, s.color])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionsKey]
  )

  const sectionNameMap = useMemo(
    () => new Map(sections.map(s => [s.id, s.name])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionsKey]
  )

  // Price lookup - always live from tier map
  const getSeatPrice = useCallback(
    (seat: SeatData): number => {
      if (seat.ticket_tier_id && tierPriceCentsMap[seat.ticket_tier_id] != null) {
        return tierPriceCentsMap[seat.ticket_tier_id]
      }
      return defaultPriceCents
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultPriceCents, JSON.stringify(tierPriceCentsMap)]
  )

  // Compute SVG viewport from seat coordinates, reserving space for stage label + row labels
  const { minX, minY, viewWidth, viewHeight, rowLabels } = useMemo(() => {
    if (seats.length === 0) {
      return {
        minX: 0,
        minY: 0,
        viewWidth: 400,
        viewHeight: 300,
        rowLabels: [] as Array<{ key: string; label: string; y: number }>,
      }
    }
    // Bounds span seats AND standing zones so a drawn zone is never clipped.
    const xs = seats.map(s => s.x)
    const ys = seats.map(s => s.y)
    for (const a of areas) {
      xs.push(a.x, a.x + a.width)
      ys.push(a.y, a.y + a.height)
    }
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    // Row labels: group by section_id + row_label, pick the smallest-x seat as anchor
    const groups = new Map<string, { label: string; y: number; count: number }>()
    for (const s of seats) {
      const key = `${s.seat_map_section_id ?? 'none'}::${s.row_label}`
      const cy = s.y - minY + PADDING + STAGE_BAND + SEAT_SIZE / 2
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, { label: s.row_label, y: cy, count: 1 })
      } else {
        existing.y = (existing.y * existing.count + cy) / (existing.count + 1)
        existing.count += 1
      }
    }
    const rowLabels = Array.from(groups.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      y: v.y,
    }))

    return {
      minX,
      minY,
      viewWidth:
        maxX - minX + SEAT_SIZE + PADDING * 2 + ROW_LABEL_GUTTER,
      viewHeight:
        maxY - minY + SEAT_SIZE + PADDING * 2 + STAGE_BAND,
      rowLabels,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey, areasKey])

  // Per-section price summary (min / max) for legend
  const sectionPriceSummary = useMemo(() => {
    const bySection = new Map<string, number[]>()
    for (const seat of seats) {
      const id = seat.seat_map_section_id
      if (!id) continue
      const price = getSeatPrice(seat)
      const arr = bySection.get(id) ?? []
      arr.push(price)
      bySection.set(id, arr)
    }
    const out = new Map<string, { min: number; max: number }>()
    for (const [id, arr] of bySection.entries()) {
      if (arr.length === 0) continue
      out.set(id, { min: Math.min(...arr), max: Math.max(...arr) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey, getSeatPrice])

  const toggleSeat = useCallback((seat: SeatData) => {
    const style = STATUS_FILL[seat.status] ?? STATUS_FILL.sold
    if (!style.clickable) return

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(seat.id)) {
        next.delete(seat.id)
      } else {
        if (next.size >= maxPerOrder) return prev
        next.add(seat.id)
      }
      return next
    })
  }, [maxPerOrder])

  const handleMouseEnter = useCallback((id: string) => {
    setHoveredId(id)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null)
  }, [])

  function pickBestAvailable(n: number) {
    const available = seats.filter(s => s.status === 'available' && !selectedIds.has(s.id))
    if (available.length === 0) return

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

  // ── Whole-table booking (the gala edge) ────────────────────────────────
  // Any row whose label reads as a table or booth sells in ONE action: a tap
  // holds every free seat at that table. Humanitix routes organisers to a
  // packaged-ticket workaround; Eventbrite sells chair by chair.
  const tableGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; sectionId: string | null; seats: SeatData[] }>()
    for (const seat of seats) {
      if (!/(table|booth)/i.test(seat.row_label)) continue
      const key = `${seat.seat_map_section_id ?? 'none'}::${seat.row_label}`
      if (!groups.has(key)) {
        groups.set(key, { key, label: seat.row_label, sectionId: seat.seat_map_section_id, seats: [] })
      }
      groups.get(key)!.seats.push(seat)
    }
    return [...groups.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey])

  function toggleTable(group: { seats: SeatData[] }) {
    const availableIds = group.seats.filter(s => s.status === 'available').map(s => s.id)
    if (availableIds.length === 0) return
    setError(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allIn = availableIds.every(id => next.has(id))
      if (allIn) {
        for (const id of availableIds) next.delete(id)
        return next
      }
      for (const id of availableIds) {
        if (next.size >= maxPerOrder) {
          setError(`Order limit is ${maxPerOrder} seats; the rest of the table stays open for your group.`)
          break
        }
        next.add(id)
      }
      return next
    })
  }

  const selectedSeats = seats.filter(s => selectedIds.has(s.id))
  const totalCents = selectedSeats.reduce((sum, s) => sum + getSeatPrice(s), 0)

  const formatPrice = useCallback(
    (cents: number) => `${currency} ${(cents / 100).toFixed(2)}`,
    [currency]
  )

  function handleProceed() {
    if (selectedIds.size === 0) return
    setError(null)
    startTransition(async () => {
      const result = await createSeatReservation({
        event_id: eventId,
        seat_ids: Array.from(selectedIds),
      })
      if (result.error) {
        // Concurrency loser path (launch-face finalisation 2026-07-12): say
        // exactly what happened and clear the stale selection so the
        // refreshed map is honest - no silent failure, no ghost picks.
        setError(result.error)
        setSelectedIds(new Set())
        router.refresh()
        return
      }
      if (result.reservation_id) {
        window.location.href = `/checkout/${result.reservation_id}?seat=1`
      }
    })
  }

  // Seat <g> elements - memoised on stable primitive keys, NOT on hoveredId.
  // Hover highlight is an overlay rendered above this layer so it never busts this memo.
  const seatElements = useMemo(
    () =>
      seats.map(seat => {
        const cx = seat.x - minX + PADDING + ROW_LABEL_GUTTER + SEAT_SIZE / 2
        const cy = seat.y - minY + PADDING + STAGE_BAND + SEAT_SIZE / 2
        const isSelected = selectedIds.has(seat.id)
        const effectiveStatus = isSelected ? 'selected' : seat.status
        const styleInfo = STATUS_FILL[effectiveStatus] ?? STATUS_FILL.sold
        const sectionColor = sectionColorMap.get(seat.seat_map_section_id ?? '') ?? GOLD
        const fill = styleInfo.fill.replace('var(--section-color)', sectionColor)

        const statusWord = isSelected
          ? 'selected'
          : styleInfo.clickable
            ? 'available'
            : 'unavailable'
        return (
          <g
            key={seat.id}
            role="img"
            aria-label={`${seat.row_label} seat ${seat.seat_number}, ${statusWord}${
              styleInfo.clickable ? `, ${formatPrice(getSeatPrice(seat))}` : ''
            }`}
            style={{ cursor: styleInfo.clickable ? 'pointer' : 'not-allowed' }}
            onClick={() => toggleSeat(seat)}
            onMouseEnter={() => handleMouseEnter(seat.id)}
            onMouseLeave={handleMouseLeave}
          >
            <rect
              x={cx - SEAT_SIZE / 2}
              y={cy - SEAT_SIZE / 2}
              width={SEAT_SIZE}
              height={SEAT_SIZE}
              rx="6"
              fill={fill}
              stroke={styleInfo.stroke}
              strokeWidth={isSelected ? 2 : 1}
              style={{ transition: 'fill 150ms ease-out, stroke 150ms ease-out' }}
            />
            <text
              x={cx}
              y={cy + 3.5}
              textAnchor="middle"
              fontSize="7.5"
              fontWeight={isSelected ? 700 : 500}
              fill={styleInfo.text}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {seat.seat_number}
            </text>
          </g>
        )
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, selectedIdsKey, minX, minY, sectionsKey, toggleSeat, handleMouseEnter, handleMouseLeave, getSeatPrice, formatPrice]
  )

  // Hover highlight rendered as a separate SVG layer, ABOVE seatElements, with pointer-events:none
  // so it can never trigger layout thrash or steal hover events from the seat below.
  const hoverOverlay = useMemo(() => {
    if (!hoveredId) return null
    const seat = seats.find(s => s.id === hoveredId)
    if (!seat) return null
    const style = STATUS_FILL[seat.status] ?? STATUS_FILL.sold
    if (!style.clickable) return null
    const cx = seat.x - minX + PADDING + ROW_LABEL_GUTTER + SEAT_SIZE / 2
    const cy = seat.y - minY + PADDING + STAGE_BAND + SEAT_SIZE / 2
    return (
      <rect
        x={cx - SEAT_SIZE / 2 - 1}
        y={cy - SEAT_SIZE / 2 - 1}
        width={SEAT_SIZE + 2}
        height={SEAT_SIZE + 2}
        rx="4"
        fill="none"
        stroke={GOLD}
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, seatsKey, minX, minY])

  const hovered = hoveredId ? seats.find(s => s.id === hoveredId) : null

  function zoomToFit() {
    setZoom(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
    }
  }

  function zoomIn() {
    setZoom(z => Math.min(2, +(z + 0.25).toFixed(2)))
  }

  function zoomOut() {
    setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))
  }

  if (seats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
        Seats are not yet available for this event.
      </div>
    )
  }

  // Reserve space for the floating tooltip so showing/hiding it doesn't shift layout
  // - this was the root cause of the bottom-row hover flicker.
  const TOOLTIP_RESERVED_PX = 40

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: INK_900, outline: `2px solid ${GOLD}`, outlineOffset: '1px' }}
          />
          <span className="text-ink-600">Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-ink-400" />
          <span className="text-ink-600">Unavailable</span>
        </div>
        {seats.some(s => s.seat_type === 'accessible' || s.seat_type === 'companion') && (
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: GOLD, outline: '2px solid #FFFFFF', outlineOffset: '-2px' }}
            />
            <span className="text-ink-600">Accessible and companion</span>
          </div>
        )}
        <span aria-live="polite" className="ml-auto font-semibold text-ink-900">
          {seats.filter(s => s.status === 'available').length} of {seats.length} seats open
        </span>

        {sections.length > 0 && (
          <span className="h-4 w-px bg-ink-200" aria-hidden="true" />
        )}

        {sections.map(s => {
          const summary = sectionPriceSummary.get(s.id)
          const priceLabel = summary
            ? summary.min === summary.max
              ? formatPrice(summary.min)
              : `from ${formatPrice(summary.min)}`
            : null
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="text-ink-900 font-medium">{s.name}</span>
              {priceLabel && (
                <span className="text-ink-400">· {priceLabel}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Whole-table booking: the gala flow, one tap per table. */}
      {tableGroups.length > 0 && (
        <div className="rounded-xl border border-gold-500/30 bg-white p-4">
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
            Book a whole table
          </p>
          <p className="mt-1 text-xs text-ink-600">
            One tap holds every free seat at the table. Tap again to let it go.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tableGroups.map(group => {
              const available = group.seats.filter(s => s.status === 'available')
              const selectedHere = available.filter(s => selectedIds.has(s.id)).length
              const fullTableSelected = available.length > 0 && selectedHere === available.length
              const soldOut = available.length === 0
              const label = soldOut
                ? `${group.label} · full`
                : fullTableSelected
                  ? `${group.label} · yours`
                  : available.length === group.seats.length
                    ? `${group.label} · book all ${available.length}`
                    : `${group.label} · book remaining ${available.length}`
              return (
                <button
                  key={group.key}
                  type="button"
                  disabled={soldOut}
                  aria-pressed={fullTableSelected}
                  onClick={() => toggleTable(group)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    fullTableSelected
                      ? 'border-ink-900 bg-gold-500 text-ink-900'
                      : 'border-ink-200 bg-white text-ink-900 hover:border-gold-500'
                  }`}
                >
                  {fullTableSelected && (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Seat map container */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-auto rounded-xl border border-ink-200 bg-canvas"
          style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        >
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            style={{
              width: `${100 * zoom}%`,
              minWidth: `${Math.min(viewWidth * zoom, 900)}px`,
              display: 'block',
            }}
            role="img"
            aria-label="Seat map"
          >
            {/* STAGE: a solid navy proscenium band with a gold footlight
                keyline, the same visual language as the platform chrome. */}
            <rect
              x={PADDING + ROW_LABEL_GUTTER}
              y={4}
              width={viewWidth - PADDING * 2 - ROW_LABEL_GUTTER}
              height={STAGE_BAND - 16}
              rx="6"
              fill={INK_900}
            />
            <rect
              x={PADDING + ROW_LABEL_GUTTER}
              y={STAGE_BAND - 12}
              width={viewWidth - PADDING * 2 - ROW_LABEL_GUTTER}
              height={2}
              rx="1"
              fill={GOLD}
            />
            <text
              x={viewWidth / 2}
              y={STAGE_BAND / 2 + 1}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              letterSpacing="4"
              fill="#FFFFFF"
            >
              STAGE
            </text>

            {/* Row labels on the left side, outside the seat grid */}
            {rowLabels.map(r => (
              <text
                key={r.key}
                x={PADDING + ROW_LABEL_GUTTER - 10}
                y={r.y + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#6B7280" /* --color-ink-400 */
                style={{ userSelect: 'none' }}
              >
                {r.label}
              </text>
            ))}

            {/* Standing/GA zones and scenery: display-only context beneath
                the seats (GA tickets sell through the general-admission
                panel; scenery orients the room and sells nothing). */}
            {areas.map(area => {
              const ax = area.x - minX + PADDING + ROW_LABEL_GUTTER
              const ay = area.y - minY + PADDING + STAGE_BAND
              const scenery = area.style === 'scenery'
              return (
                <g key={`${area.label}-${area.x}-${area.y}`} aria-hidden="true">
                  <rect
                    x={ax} y={ay} width={area.width} height={area.height} rx={10}
                    fill={scenery ? INK_900 : area.color}
                    fillOpacity={scenery ? 0.06 : 0.14}
                    stroke={scenery ? '#9CA3AF' : area.color}
                    strokeWidth={1.5}
                    strokeDasharray={scenery ? undefined : '6 4'}
                  />
                  <text x={ax + area.width / 2} y={ay + area.height / 2 + (scenery ? 4 : -2)} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK_900}>
                    {area.label}
                  </text>
                  {!scenery && (
                    <text x={ax + area.width / 2} y={ay + area.height / 2 + 12} textAnchor="middle" fontSize={9} fill="#6B7280">
                      General admission
                    </text>
                  )}
                </g>
              )
            })}

            {/* Seats first, then hover overlay - overlay MUST render last so it layers on top */}
            {seatElements}
            {hoverOverlay}
          </svg>
        </div>

        {/* Floating zoom controls bottom-right */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-ink-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-sm font-bold text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= 2}
            className="flex h-8 w-8 items-center justify-center text-sm font-bold text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="h-6 w-px bg-ink-200" aria-hidden="true" />
          <button
            type="button"
            onClick={zoomToFit}
            className="flex h-8 items-center gap-1 rounded-r-lg px-2.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors"
            aria-label="Zoom to fit"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
            </svg>
            Fit
          </button>
        </div>
      </div>

      {/* Reserved-height tooltip row - prevents layout shift on hover (fixes bottom-row flicker) */}
      <div
        className="transition-opacity duration-150"
        style={{ minHeight: `${TOOLTIP_RESERVED_PX}px` }}
      >
        {hovered ? (
          <div className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-xs text-white">
            <span className="font-semibold">Row {hovered.row_label} · Seat {hovered.seat_number}</span>
            {hovered.seat_map_section_id && sectionNameMap.get(hovered.seat_map_section_id) && (
              <span className="text-ink-200">· {sectionNameMap.get(hovered.seat_map_section_id)}</span>
            )}
            {hovered.seat_type !== 'standard' && (
              <span className="capitalize text-ink-200">· {hovered.seat_type}</span>
            )}
            <span className="text-white/90">
              · {hovered.status === 'available'
                ? formatPrice(getSeatPrice(hovered))
                : hovered.status === 'reserved'
                ? 'Being reserved'
                : 'Unavailable'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-ink-400">Hover a seat for details · tap to select</p>
        )}
      </div>

      {/* Best available */}
      {[1, 2, 3, 4, 5, 6, 8, 10].filter(n => n <= maxPerOrder).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-600">Best available:</span>
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
                className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 hover:border-gold-500 hover:text-ink-900 transition-colors"
              >
                {n}
              </button>
            ))}
        </div>
      )}

      {/* Selection summary + proceed */}
      <div className="rounded-xl border border-ink-200 bg-white p-4">
        {selectedIds.size === 0 ? (
          <p className="text-sm text-ink-400 text-center">
            Click seats on the map to select them
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              {selectedSeats.map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">
                    Row {s.row_label} · Seat {s.seat_number}
                    {s.seat_type !== 'standard' && (
                      <span className="ml-1 text-xs text-ink-400 capitalize">({s.seat_type})</span>
                    )}
                  </span>
                  <span className="font-semibold text-ink-900">
                    {formatPrice(getSeatPrice(s))}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-400">
                  {selectedIds.size} seat{selectedIds.size !== 1 ? 's' : ''}
                </p>
                <p className="text-base font-bold text-ink-900">{formatPrice(totalCents)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-medium text-ink-400 hover:text-ink-900 hover:underline decoration-gold-500 decoration-2 underline-offset-2 transition-colors"
              >
                Clear
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
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
          className="mt-4 w-full rounded-xl bg-gold-500 hover:bg-gold-600 py-3 text-sm font-semibold text-ink-900 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md"
        >
          {isPending
            ? 'Reserving seats…'
            : selectedIds.size === 0
            ? 'Select seats to continue'
            : `Reserve ${selectedIds.size} seat${selectedIds.size !== 1 ? 's' : ''} · ${formatPrice(totalCents)}`}
        </button>
      </div>
    </div>
  )
}
