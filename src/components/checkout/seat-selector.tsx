'use client'

import { useState, useTransition, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSeatReservation } from '@/app/actions/seat-reservations'
import { pickBestAvailableAction } from '@/app/actions/best-available'
import { editorialSectionColor } from '@/lib/seating/palette'
import { selectionCreatedOrphans, type BASeat } from '@/lib/seating/best-available'

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
  available:  { fill: 'var(--section-color)', stroke: 'rgba(255,255,255,0.35)', text: '#FFFFFF', clickable: true },
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
  const [pickPending, setPickPending] = useState(false)
  /** S4: the active price band [min, max] cents; seats outside it recede. */
  const [priceFilter, setPriceFilter] = useState<[number, number] | null>(null)
  /** Eased zoom only for button zooms: gestures must track fingers 1:1. */
  const [animateZoom, setAnimateZoom] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Touch-first zoom and pan engine ─────────────────────────────────────
  // Drag pans (after a 6px intent threshold so taps still select), two
  // fingers pinch-zoom around the gesture midpoint, Ctrl+scroll and trackpad
  // pinch zoom around the cursor, double-tap steps in. All zoom paths keep
  // the focal point stationary by correcting scroll after the width change.
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3
  const zoomRef = useRef(1)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch'
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
    startDist: number
    startZoom: number
  }>({ mode: 'idle', startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, startDist: 0, startZoom: 1 })
  const suppressClickRef = useRef(false)
  const pendingFocalRef = useRef<{ fx: number; fy: number; ratio: number; left: number; top: number } | null>(null)

  const applyZoom = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +next.toFixed(3)))
    if (el && clamped !== zoomRef.current) {
      const rect = el.getBoundingClientRect()
      const fx = clientX !== undefined ? clientX - rect.left : rect.width / 2
      const fy = clientY !== undefined ? clientY - rect.top : rect.height / 2
      pendingFocalRef.current = {
        fx, fy,
        ratio: clamped / zoomRef.current,
        left: el.scrollLeft,
        top: el.scrollTop,
      }
    }
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])

  useLayoutEffect(() => {
    const p = pendingFocalRef.current
    const el = scrollRef.current
    if (!p || !el) return
    pendingFocalRef.current = null
    el.scrollLeft = (p.left + p.fx) * p.ratio - p.fx
    el.scrollTop = (p.top + p.fy) * p.ratio - p.fy
  }, [zoom])

  function onMapPointerDown(e: React.PointerEvent) {
    setAnimateZoom(false)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const el = scrollRef.current
    if (!el) return
    const pts = [...pointersRef.current.values()]
    if (pts.length === 1) {
      gestureRef.current = {
        mode: 'idle',
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        startDist: 0,
        startZoom: zoomRef.current,
      }
    } else if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      gestureRef.current = { ...gestureRef.current, mode: 'pinch', startDist: dist, startZoom: zoomRef.current }
      suppressClickRef.current = true
    }
  }

  function onMapPointerMove(e: React.PointerEvent) {
    const el = scrollRef.current
    if (!el || !pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gestureRef.current
    const pts = [...pointersRef.current.values()]

    if (g.mode === 'pinch' && pts.length === 2 && g.startDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      applyZoom(g.startZoom * (dist / g.startDist), midX, midY)
      return
    }

    if (pts.length === 1) {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (g.mode === 'idle' && Math.hypot(dx, dy) > 6) {
        g.mode = 'pan'
        suppressClickRef.current = true
      }
      if (g.mode === 'pan') {
        el.scrollLeft = g.scrollLeft - dx
        el.scrollTop = g.scrollTop - dy
      }
    }
  }

  function onMapPointerEnd(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 0) {
      gestureRef.current.mode = 'idle'
      // Let the click that follows this pointerup be judged first, then re-arm.
      setTimeout(() => { suppressClickRef.current = false }, 0)
    }
  }

  function onMapClickCapture(e: React.MouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // Ctrl+wheel is the browser convention for zoom (trackpad pinch arrives the
  // same way); plain wheel keeps scrolling the page. React registers wheel as
  // passive, so this must be a native non-passive listener to preventDefault.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setAnimateZoom(false)
      applyZoom(zoomRef.current * factor, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  function onMapDoubleClick(e: React.MouseEvent) {
    applyZoom(zoomRef.current >= MAX_ZOOM ? 1 : zoomRef.current * 1.5, e.clientX, e.clientY)
  }

  // Primitive keys: only recompute memos when content changes, not on every array reference change
  const seatsKey = seats.map(s => `${s.id}:${s.status}`).join('|')
  const sectionsKey = sections.map(s => `${s.id}:${s.color}:${s.name}`).join('|')
  const areasKey = areas.map(a => `${a.label}:${a.x}:${a.y}:${a.width}:${a.height}`).join('|')
  const selectedIdsKey = [...selectedIds].sort().join(',')

  const sectionColorMap = useMemo(
    () => new Map(sections.map(s => [s.id, editorialSectionColor(s.color)])),
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

  /** Seats in the pure-cascade shape (S1/S2 share one geometry brain). */
  const baSeats = useMemo<BASeat[]>(
    () =>
      seats.map(s => ({
        id: s.id,
        section_id: s.seat_map_section_id,
        row_label: s.row_label,
        seat_number: s.seat_number,
        x: s.x,
        y: s.y,
        status: s.status,
        seat_type: s.seat_type,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey],
  )

  /** S2: the single seats this selection would strand (never pre-existing ones). */
  const strandedBySelection = useMemo(
    () => selectionCreatedOrphans(baSeats, selectedIds),
    [baSeats, selectedIds],
  )

  /**
   * S1: best available, server side. The cascade runs on the live seat
   * state with the chart's focal point; the local contiguous fallback only
   * answers if the action itself fails (offline, cold deploy).
   */
  async function pickBestAvailable(n: number) {
    setPickPending(true)
    try {
      const pick = await pickBestAvailableAction({ event_id: eventId, quantity: n })
      const openIds = new Set(seats.filter(s => s.status === 'available').map(s => s.id))
      const usable = pick.seat_ids.filter(id => openIds.has(id)).slice(0, maxPerOrder)
      if (usable.length > 0) {
        setSelectedIds(new Set(usable))
        return
      }
      if (pick.strategy !== 'error') return // an honest "nothing fits" stays empty
    } catch {
      // fall through to the local picker
    } finally {
      setPickPending(false)
    }
    pickBestAvailableLocal(n)
  }

  /** The pre-v2 client picker, kept as the degraded-mode fallback only. */
  function pickBestAvailableLocal(n: number) {
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

  /**
   * S4: the price bands the filter offers. Every distinct seat price gets
   * its own chip up to five; busier houses collapse into four even ranges.
   * One price only means no filter is worth showing.
   */
  const priceBands = useMemo(() => {
    const prices = [
      ...new Set(seats.filter(s => s.status === 'available').map(getSeatPrice)),
    ].sort((a, b) => a - b)
    if (prices.length <= 1) return []
    if (prices.length <= 5) {
      return prices.map(p => ({ label: formatPrice(p), min: p, max: p }))
    }
    const bands: { label: string; min: number; max: number }[] = []
    for (let i = 0; i < 4; i++) {
      const lo = prices[Math.floor((i * prices.length) / 4)]
      const hi = prices[Math.min(prices.length - 1, Math.floor(((i + 1) * prices.length) / 4) - 1)]
      if (bands.length > 0 && bands[bands.length - 1].max >= lo) continue
      bands.push({
        label: lo === hi ? formatPrice(lo) : `${formatPrice(lo)} to ${formatPrice(hi)}`,
        min: lo,
        max: hi,
      })
    }
    return bands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey, getSeatPrice, formatPrice])

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

  // Density optics (3e): numerals and keylines earn their place by effective
  // on-screen size, so 50-seat rooms read warm and 2000-seat rooms read
  // clean. Quantised to booleans so pinch zoom never re-renders every seat.
  const effectiveSeatPx = (Math.min(viewWidth, 900) * zoom * SEAT_SIZE) / viewWidth
  const showNumerals = effectiveSeatPx >= 13
  const thinKeylines = effectiveSeatPx < 10
  const priceFilterKey = priceFilter ? `${priceFilter[0]}-${priceFilter[1]}` : 'all'

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

        // S4: seats priced outside the active band recede and stop selling
        // until the filter clears (they stay visible so the room reads whole).
        const price = getSeatPrice(seat)
        const outsideFilter =
          priceFilter !== null &&
          styleInfo.clickable &&
          (price < priceFilter[0] || price > priceFilter[1])
        const clickable = styleInfo.clickable && !outsideFilter

        const statusWord = isSelected
          ? 'selected'
          : outsideFilter
            ? 'outside your price filter'
            : styleInfo.clickable
              ? 'available'
              : 'unavailable'
        return (
          <g
            key={seat.id}
            role="img"
            aria-label={`${seat.row_label} seat ${seat.seat_number}, ${statusWord}${
              clickable ? `, ${formatPrice(price)}` : ''
            }`}
            opacity={outsideFilter ? 0.22 : 1}
            style={{
              cursor: clickable ? 'pointer' : 'not-allowed',
              transition: 'opacity 200ms ease-out',
            }}
            onClick={() => clickable && toggleSeat(seat)}
            onMouseEnter={() => handleMouseEnter(seat.id)}
            onMouseLeave={handleMouseLeave}
          >
            <rect
              key={`${seat.id}:${isSelected ? 'sel' : 'open'}`}
              className={isSelected ? 'seat-bloom' : undefined}
              x={cx - SEAT_SIZE / 2}
              y={cy - SEAT_SIZE / 2}
              width={SEAT_SIZE}
              height={SEAT_SIZE}
              rx={SEAT_SIZE * 0.3}
              fill={fill}
              stroke={styleInfo.stroke}
              strokeWidth={isSelected ? 2 : thinKeylines ? 0.6 : 1}
              filter={isSelected ? 'url(#seat-elevation)' : undefined}
              style={{ transition: 'fill 150ms ease-out, stroke 150ms ease-out' }}
            />
            {showNumerals && (
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fontSize="7.5"
                fontWeight={isSelected ? 700 : 600}
                letterSpacing="0.02em"
                fill={styleInfo.text}
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {seat.seat_number}
              </text>
            )}
          </g>
        )
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, selectedIdsKey, minX, minY, sectionsKey, toggleSeat, handleMouseEnter, handleMouseLeave, getSeatPrice, formatPrice, priceFilterKey, showNumerals, thinKeylines]
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

  // Button zooms glide on a real easing curve; gesture zooms track fingers
  // 1:1 (animating a pinch would fight the hand). Reduced motion gets no
  // glide at all.
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  function zoomToFit() {
    setAnimateZoom(!prefersReducedMotion)
    zoomRef.current = 1
    pendingFocalRef.current = null
    setZoom(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
    }
  }

  function zoomIn() {
    setAnimateZoom(!prefersReducedMotion)
    applyZoom(zoomRef.current + 0.25)
  }

  function zoomOut() {
    setAnimateZoom(!prefersReducedMotion)
    applyZoom(zoomRef.current - 0.25)
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
      {/* The legend: a designed bar, seat-shaped swatches, sections as
          chips with their prices, the open count holding the right edge. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF0F4] px-2.5 py-1 text-xs text-ink-900">
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-[30%] shadow-sm"
            style={{ backgroundColor: GOLD, outline: `1.5px solid ${INK_900}`, outlineOffset: '1px' }}
          />
          Selected
        </span>
        {/* The Chanel cut (3e): the Unavailable chip came off the finished
            screen. Stone-grey receded seats explain themselves; the chip was
            the legend's least informative element. */}
        {seats.some(s => s.seat_type === 'accessible' || s.seat_type === 'companion') && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF0F4] px-2.5 py-1 text-xs text-ink-600">
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-[30%]"
              style={{
                backgroundColor: editorialSectionColor(sections[0]?.color) ?? GOLD,
                outline: '1.5px solid #FFFFFF',
                outlineOffset: '-2px',
              }}
            />
            Accessible and companion
          </span>
        )}
        {sections.map(s => {
          const summary = sectionPriceSummary.get(s.id)
          const priceLabel = summary
            ? summary.min === summary.max
              ? formatPrice(summary.min)
              : `from ${formatPrice(summary.min)}`
            : null
          return (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF0F4] px-2.5 py-1 text-xs">
              <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-[30%]"
                style={{ backgroundColor: editorialSectionColor(s.color) }}
              />
              <span className="font-medium text-ink-900">{s.name}</span>
              {priceLabel && <span className="text-ink-400">{priceLabel}</span>}
            </span>
          )
        })}
        <span
          aria-live="polite"
          className="ml-auto font-display text-xs font-bold uppercase tracking-[0.08em] text-ink-900"
        >
          {seats.filter(s => s.status === 'available').length} of {seats.length} open
        </span>
      </div>

      {/* S4: the price filter. Seats outside the chosen band recede on the
          map until the filter clears; the room always stays whole. */}
      {priceBands.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter seats by price">
          <span className="text-xs font-medium text-ink-600">Price:</span>
          <button
            type="button"
            aria-pressed={priceFilter === null}
            onClick={() => setPriceFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 ${
              priceFilter === null
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-gold-500 hover:text-ink-900'
            }`}
          >
            All prices
          </button>
          {priceBands.map(band => {
            const active =
              priceFilter !== null && priceFilter[0] === band.min && priceFilter[1] === band.max
            return (
              <button
                key={`${band.min}-${band.max}`}
                type="button"
                aria-pressed={active}
                onClick={() => setPriceFilter(active ? null : [band.min, band.max])}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 ${
                  active
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-gold-500 hover:text-ink-900'
                }`}
              >
                {band.label}
              </button>
            )
          })}
        </div>
      )}

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
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1 ${
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
          className="overflow-auto overscroll-contain rounded-xl border border-ink-200 bg-canvas"
          style={{ touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onMapPointerDown}
          onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerEnd}
          onPointerCancel={onMapPointerEnd}
          onPointerLeave={onMapPointerEnd}
          onClickCapture={onMapClickCapture}
          onDoubleClick={onMapDoubleClick}
          role="group"
          aria-label="Seat map viewport: drag to pan, pinch or Ctrl and scroll to zoom"
        >
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            style={{
              width: `${100 * zoom}%`,
              minWidth: `${Math.min(viewWidth, 900) * zoom}px`,
              display: 'block',
              transition: animateZoom
                ? 'width 240ms cubic-bezier(0.22, 1, 0.36, 1), min-width 240ms cubic-bezier(0.22, 1, 0.36, 1)'
                : undefined,
            }}
            role="img"
            aria-label="Seat map"
          >
            <defs>
              {/* The stage light: the signature element. A quiet gold wash
                  cast from the stage apron, clamped so a 2000-seat plan
                  stays clean. The good seats sit in the light. */}
              <radialGradient id="stage-light" cx="0.5" cy="0" r="1">
                <stop offset="0%" stopColor={GOLD} stopOpacity="0.14" />
                <stop offset="55%" stopColor={GOLD} stopOpacity="0.05" />
                <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
              </radialGradient>
              {/* Elevation on selection: a soft navy lift, not a heavy drop. */}
              <filter id="seat-elevation" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow
                  dx="0"
                  dy="1.4"
                  stdDeviation="1.8"
                  floodColor="#0A1628"
                  floodOpacity="0.45"
                />
              </filter>
            </defs>

            {/* STAGE: the designed proscenium. Navy body, gold filament
                footlight, letterspaced wordmark: the platform chrome
                carried into the room. */}
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
            {/* The light apron the filament casts onto the plan. */}
            <rect
              x={PADDING + ROW_LABEL_GUTTER}
              y={STAGE_BAND - 10}
              width={viewWidth - PADDING * 2 - ROW_LABEL_GUTTER}
              height={Math.min(150, viewHeight * 0.35)}
              fill="url(#stage-light)"
              style={{ pointerEvents: 'none' }}
              aria-hidden="true"
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
              const areaColor = editorialSectionColor(area.color)
              return (
                <g key={`${area.label}-${area.x}-${area.y}`} aria-hidden="true">
                  <rect
                    x={ax} y={ay} width={area.width} height={area.height} rx={10}
                    fill={scenery ? INK_900 : areaColor}
                    fillOpacity={scenery ? 0.06 : 0.14}
                    stroke={scenery ? '#9CA3AF' : areaColor}
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
            disabled={zoom <= MIN_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-sm font-bold text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="flex h-8 w-8 items-center justify-center text-sm font-bold text-ink-600 hover:bg-ink-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="h-6 w-px bg-ink-200" aria-hidden="true" />
          <button
            type="button"
            onClick={zoomToFit}
            className="flex h-8 items-center gap-1 rounded-r-lg px-2.5 text-[11px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
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
          <p className="text-xs text-ink-400">
            Tap a seat to select · drag to pan · pinch or Ctrl+scroll to zoom
          </p>
        )}
      </div>

      {/* Best available: the server cascade picks from the stage light out. */}
      {[1, 2, 3, 4, 5, 6, 8, 10].filter(n => n <= maxPerOrder).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-600">
            {pickPending ? 'Finding the best seats…' : 'Best available:'}
          </span>
          {[1, 2, 3, 4, 5, 6, 8, 10]
            .filter(n => n <= maxPerOrder)
            .map(n => (
              <button
                key={n}
                type="button"
                disabled={pickPending}
                onClick={() => {
                  setSelectedIds(new Set())
                  void pickBestAvailable(n)
                }}
                className="min-w-8 rounded-full border border-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
              >
                {n}
              </button>
            ))}
        </div>
      )}

      {/* S2: the orphan nudge. Advisory, never a wall: the buyer keeps the
          right to their exact seats; one tap re-picks the party cleanly. */}
      {strandedBySelection.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-3"
        >
          <p className="text-xs text-ink-900">
            <span className="font-semibold">
              Your picks leave{' '}
              {strandedBySelection.length === 1
                ? `seat ${strandedBySelection[0].row_label}-${strandedBySelection[0].seat_number} stranded on its own`
                : `${strandedBySelection.length} single seats stranded`}
              .
            </span>{' '}
            Rooms sell out cleaner without lone seats.
          </p>
          <button
            type="button"
            disabled={pickPending}
            onClick={() => void pickBestAvailable(selectedIds.size)}
            className="rounded-full border border-ink-900 bg-white px-3 py-1 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
          >
            Sit us together, best spot
          </button>
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
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold text-ink-900">
                      {formatPrice(getSeatPrice(s))}
                    </span>
                    {/* The keyboard path to remove one seat (the map itself
                        is pointer-first; selection is fully keyboard-editable
                        from this list). */}
                    <button
                      type="button"
                      aria-label={`Remove row ${s.row_label} seat ${s.seat_number}`}
                      onClick={() => toggleSeat(s)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
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
                className="rounded text-xs font-medium text-ink-400 transition-colors hover:text-ink-900 hover:underline decoration-gold-500 decoration-2 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
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
          className="mt-4 w-full rounded-xl bg-gold-500 hover:bg-gold-600 py-3 text-sm font-semibold text-ink-900 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
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
