'use client'

/**
 * The buyer's drawing sheet: the seat map presented as the venue's own
 * drafted plan (Canvas 2D, retained scene graph) beside the schedule rail
 * (the ticket-type legend, the party-and-price control, the selection).
 *
 * Ticket type is the primary colour encoding; sections live as labelled
 * polygons on the sheet. Gold belongs to the buyer alone: their chairs,
 * their cursor, their viewport on the key plan. The cascade, the orphan
 * guards, whole-table booking, group tickets and the palette sets all run
 * through the same pure libraries as before; only the presentation is new.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSeatReservation } from '@/app/actions/seat-reservations'
import { pickBestAvailableAction } from '@/app/actions/best-available'
import {
  SECTION_COLORS,
  SEAT_PALETTE_SET_META,
  SEAT_PALETTE_SETS,
  sectionColorForSet,
} from '@/lib/seating/palette'
import { useSeatPaletteSet } from '@/lib/seating/use-seat-palette'
import {
  contiguousGroupWindow,
  selectionCreatedOrphans,
  type BASeat,
} from '@/lib/seating/best-available'
import { buildScene, type SceneObjectInput } from '@/lib/seating/render/scene'
import { CHAIR_BACK_PATH, CHAIR_PAN_PATH } from '@/lib/seating/render/glyphs'
import type { SeatVisualState } from '@/lib/seating/render/draw'
import type { LodState } from '@/lib/seating/render/lod'
import { SeatCanvas, type SeatCanvasHandle } from '@/components/seating/seat-canvas'
import { KeyPlan } from '@/components/seating/key-plan'
import { SectionViewImage } from '@/components/media/SectionViewImage'
import { Camera, Maximize, Minus, Plus, X } from 'lucide-react'

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

/** Stage geometry and venue objects carried in the chart layout. */
export interface SeatDecorData {
  stage?: {
    shape: 'proscenium' | 'thrust' | 'round' | 'band'
    x: number
    y: number
    width: number
    depth: number
    rotation?: number
  } | null
  objects?: SceneObjectInput[]
}

/** A seat-bound ticket tier for the schedule rail. */
export interface SeatTierData {
  id: string
  name: string
  price_cents: number
  min_per_order: number
}

interface Props {
  eventId: string
  seats: SeatData[]
  sections: SectionData[]
  areas?: SeatAreaData[]
  decor?: SeatDecorData
  tiers?: SeatTierData[]
  defaultPriceCents: number
  currency: string
  maxPerOrder: number
  tierPriceCentsMap?: Record<string, number>
  /** View-from-seat photographs, keyed by LOWERCASED section name. */
  sectionViews?: Record<string, string>
}

export function SeatSelector({
  eventId,
  seats,
  sections,
  areas = [],
  decor,
  tiers = [],
  defaultPriceCents,
  currency,
  maxPerOrder,
  tierPriceCentsMap = {},
  sectionViews = {},
}: Props) {
  const router = useRouter()
  const canvasRef = useRef<SeatCanvasHandle>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const paletteMenuRef = useRef<HTMLDivElement>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** Group-ticket units: removing any seat of a unit removes the unit. */
  const [groupUnits, setGroupUnits] = useState<string[][]>([])
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  const [stripIndex, setStripIndex] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pickPending, setPickPending] = useState(false)
  /** The active price band [min, max] cents; seats outside it recede. */
  const [priceFilter, setPriceFilter] = useState<[number, number] | null>(null)
  /** The schedule filter: one ticket type holds the floor. */
  const [tierFilter, setTierFilter] = useState<string | null>(null)
  const [partySize, setPartySize] = useState(2)
  const [pickNote, setPickNote] = useState<string | null>(null)
  const [viewingSection, setViewingSection] = useState<string | null>(null)
  const [keyboardNote, setKeyboardNote] = useState('')
  const [paletteSet, setPaletteSet] = useSeatPaletteSet()
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false)
  const [cameraInfo, setCameraInfo] = useState<{ scale: number; fitScale: number; lod: LodState }>({
    scale: 1,
    fitScale: 1,
    lod: 'mid',
  })

  const formatPrice = useCallback(
    (cents: number) => `${currency} ${(cents / 100).toFixed(2)}`,
    [currency],
  )

  // Stable content keys so memos survive array identity churn.
  const seatsKey = seats.map(s => `${s.id}:${s.status}`).join('|')
  const sectionsKey = sections.map(s => `${s.id}:${s.color}:${s.name}`).join('|')
  const tiersKey = tiers.map(t => `${t.id}:${t.price_cents}:${t.min_per_order}`).join('|')
  const selectedIdsKey = [...selectedIds].sort().join(',')

  // ── Ticket type is the primary colour encoding (item 9). Tiers wear the
  // editorial tones in schedule order; seats with no tier fall back to
  // their section's tone. Every hue rides the colour-vision set. ──────────
  const tierHueMap = useMemo(() => {
    const map = new Map<string, string>()
    tiers.forEach((tier, i) => {
      map.set(tier.id, sectionColorForSet(SECTION_COLORS[i % SECTION_COLORS.length], paletteSet))
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiersKey, paletteSet])

  const sectionColorMap = useMemo(
    () => new Map(sections.map(s => [s.id, sectionColorForSet(s.color, paletteSet)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionsKey, paletteSet],
  )

  const sectionNameMap = useMemo(
    () => new Map(sections.map(s => [s.id, s.name])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionsKey],
  )

  const tierById = useMemo(() => new Map(tiers.map(t => [t.id, t])), [tiersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const getSeatPrice = useCallback(
    (seat: { ticket_tier_id: string | null }): number => {
      if (seat.ticket_tier_id && tierPriceCentsMap[seat.ticket_tier_id] != null) {
        return tierPriceCentsMap[seat.ticket_tier_id]
      }
      return defaultPriceCents
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultPriceCents, JSON.stringify(tierPriceCentsMap)],
  )

  // ── The scene: built once per data change, painted many times. ──────────
  const scene = useMemo(() => {
    return buildScene({
      seats,
      sections,
      areas: areas.map(a => ({ ...a, color: sectionColorForSet(a.color, paletteSet) })),
      stage: decor?.stage ?? undefined,
      objects: decor?.objects ?? [],
      priceForSeat: s => getSeatPrice(s),
      colorForSeat: s =>
        (s.ticket_tier_id && tierHueMap.get(s.ticket_tier_id)) ??
        sectionColorMap.get(s.seat_map_section_id ?? '') ??
        sectionColorForSet(SECTION_COLORS[0], paletteSet),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey, sectionsKey, tierHueMap, sectionColorMap, paletteSet, getSeatPrice])

  const seatIndexById = useMemo(() => {
    const map = new Map<string, number>()
    scene.seats.forEach((s, i) => map.set(s.id, i))
    return map
  }, [scene])

  /** Seats in the pure-cascade shape (one geometry brain platform-wide). */
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

  const strandedBySelection = useMemo(
    () => selectionCreatedOrphans(baSeats, selectedIds),
    [baSeats, selectedIds],
  )

  const priceFilterKey = priceFilter ? `${priceFilter[0]}-${priceFilter[1]}` : 'all'

  const stateFor = useCallback(
    (index: number): SeatVisualState => {
      const seat = seats[index]
      if (!seat) return 'taken'
      if (selectedIds.has(seat.id)) return 'selected'
      if (seat.status !== 'available') return 'taken'
      const price = getSeatPrice(seat)
      if (priceFilter && (price < priceFilter[0] || price > priceFilter[1])) return 'dimmed'
      if (tierFilter && seat.ticket_tier_id !== tierFilter) return 'dimmed'
      return 'available'
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, selectedIdsKey, priceFilterKey, tierFilter, getSeatPrice],
  )

  const paintKey = `${selectedIdsKey}|${priceFilterKey}|${tierFilter ?? ''}|${paletteSet}|${seatsKey}`

  // Close the palette menu on outside click or Escape.
  useEffect(() => {
    if (!paletteMenuOpen) return
    function onDown(e: MouseEvent) {
      if (paletteMenuRef.current && !paletteMenuRef.current.contains(e.target as Node)) {
        setPaletteMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPaletteMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [paletteMenuOpen])

  // Keep the floating tooltip inside the sheet: measure and clamp.
  useLayoutEffect(() => {
    const tip = tooltipRef.current
    const sheet = sheetRef.current
    if (!tip || !sheet || !hover) return
    const sheetRect = sheet.getBoundingClientRect()
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    let left = hover.x - w / 2
    let top = hover.y - h - 14
    left = Math.max(8, Math.min(sheetRect.width - w - 8, left))
    if (top < 8) top = hover.y + 18
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  }, [hover])

  // ── Selection: single seats toggle; group tiers select as one unit.
  // Removing any seat of a unit releases the whole unit. State updates run
  // linearly (never inside an updater) so StrictMode cannot double-fire
  // the side effects. ─────────────────────────────────────────────────────
  const deselectSeat = useCallback(
    (seatId: string) => {
      const unit = groupUnits.find(u => u.includes(seatId))
      const ids = unit ?? [seatId]
      setSelectedIds(prev => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      if (unit) {
        setGroupUnits(prev => prev.filter(u => u !== unit))
        // The held-together note describes a unit that no longer exists.
        setPickNote(null)
      }
    },
    [groupUnits],
  )

  const activateSeat = useCallback(
    (index: number) => {
      const seat = seats[index]
      if (!seat) return
      setStripIndex(index)
      setError(null)
      if (selectedIds.has(seat.id)) {
        deselectSeat(seat.id)
        return
      }
      const state = stateFor(index)
      if (state === 'taken') {
        setKeyboardNote(`Row ${seat.row_label} seat ${seat.seat_number} is unavailable`)
        return
      }
      if (state === 'dimmed') {
        setKeyboardNote(
          priceFilter && tierFilter
            ? 'That seat sits outside your filters'
            : priceFilter
              ? 'That seat sits outside your price band'
              : 'That seat belongs to another ticket type; clear the schedule filter to take it',
        )
        return
      }

      const tier = seat.ticket_tier_id ? tierById.get(seat.ticket_tier_id) : undefined
      const groupSize = tier && tier.min_per_order > 1 ? tier.min_per_order : 1

      if (groupSize > 1) {
        // Group tickets ride the same guards as every pick: contiguous
        // within the tier, orphan-safe where the row allows it. Already
        // selected seats mask as reserved so units never overlap.
        const tierSeats = baSeats
          .filter(s => seats[seatIndexById.get(s.id) ?? -1]?.ticket_tier_id === tier!.id)
          .map(s => (selectedIds.has(s.id) ? { ...s, status: 'reserved' } : s))
        const unit = contiguousGroupWindow(tierSeats, seat.id, groupSize)
        if (!unit) {
          setPickNote(
            `${tier!.name} needs ${groupSize} seats side by side; this row cannot host the group here.`,
          )
          return
        }
        if (selectedIds.size + unit.length > maxPerOrder) {
          setError(`Order limit is ${maxPerOrder} seats.`)
          return
        }
        setSelectedIds(prev => {
          const next = new Set(prev)
          for (const id of unit) next.add(id)
          return next
        })
        setGroupUnits(units => [...units, unit])
        const numbers = unit
          .map(id => seats[seatIndexById.get(id) ?? -1]?.seat_number)
          .filter(Boolean)
          .join(', ')
        setPickNote(`${tier!.name}: seats ${numbers} held together in row ${seat.row_label}.`)
        return
      }

      if (selectedIds.size >= maxPerOrder) {
        setError(`Order limit is ${maxPerOrder} seats.`)
        return
      }
      setSelectedIds(prev => new Set(prev).add(seat.id))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, selectedIdsKey, stateFor, tierById, baSeats, seatIndexById, maxPerOrder, priceFilter, tierFilter, deselectSeat],
  )

  // Keyboard cursor: announce and keep the seat in view.
  const handleCursor = useCallback(
    (index: number) => {
      setFocusIndex(index)
      setStripIndex(index)
      const seat = seats[index]
      if (!seat) return
      const state = stateFor(index)
      const word =
        state === 'selected' ? 'selected' : state === 'available' ? 'available' : state === 'dimmed' ? 'outside your filters' : 'unavailable'
      setKeyboardNote(
        `Row ${seat.row_label} seat ${seat.seat_number}, ${word}${
          state === 'available' ? `, ${formatPrice(getSeatPrice(seat))}` : ''
        }`,
      )
      const handle = canvasRef.current
      if (handle) {
        const cam = handle.getCamera()
        const { width, height } = handle.getViewSize()
        const sx = seat.x * cam.scale + cam.tx
        const sy = seat.y * cam.scale + cam.ty
        const margin = 48
        if (sx < margin || sx > width - margin || sy < margin || sy > height - margin) {
          handle.centreOnSeat(index)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seatsKey, stateFor, formatPrice, getSeatPrice],
  )

  const groupIndices = useMemo(() => {
    const out: number[] = []
    for (const unit of groupUnits) {
      for (const id of unit) {
        const i = seatIndexById.get(id)
        if (i != null) out.push(i)
      }
    }
    return out
  }, [groupUnits, seatIndexById])

  // ── Best available: the ONE control (kept logic, server first). ─────────
  async function pickBestAvailable(n: number) {
    setPickPending(true)
    setPickNote(null)
    try {
      const pick = await pickBestAvailableAction({
        event_id: eventId,
        quantity: n,
        ...(priceFilter ? { min_price_cents: priceFilter[0], max_price_cents: priceFilter[1] } : {}),
      })
      const openIds = new Set(seats.filter(s => s.status === 'available').map(s => s.id))
      const usable = pick.seat_ids.filter(id => openIds.has(id)).slice(0, maxPerOrder)
      if (usable.length > 0) {
        setSelectedIds(new Set(usable))
        setGroupUnits([])
        setPickNote(
          pick.strategy === 'contiguous'
            ? n === 1
              ? 'Found: the best open seat in the room.'
              : `Found: ${usable.length} together, the best block open.`
            : pick.strategy === 'table'
              ? 'Found: a whole table for your party.'
              : pick.strategy === 'contiguous-with-orphan' || pick.strategy === 'scattered'
                ? 'Found: the closest the room can seat you together right now.'
                : null,
        )
        return
      }
      if (pick.strategy === 'ga') {
        setPickNote('No seated block fits this party; the standing zone sells through its own tickets below.')
        return
      }
      if (pick.strategy === 'none') {
        setPickNote(
          priceFilter
            ? 'Nothing fits under that price right now; try widening the price or the party.'
            : 'Not enough open seats for that party size.',
        )
        return
      }
      if (pick.strategy !== 'error') return
    } catch {
      // fall through to the local picker
    } finally {
      setPickPending(false)
    }
    pickBestAvailableLocal(n)
  }

  /** The degraded-mode local picker (offline, cold deploy). */
  function pickBestAvailableLocal(n: number) {
    const available = seats.filter(
      s =>
        s.status === 'available' &&
        !selectedIds.has(s.id) &&
        (priceFilter === null ||
          (getSeatPrice(s) >= priceFilter[0] && getSeatPrice(s) <= priceFilter[1])),
    )
    if (available.length === 0) return

    const rows = new Map<string, SeatData[]>()
    for (const seat of available) {
      const key = `${seat.seat_map_section_id ?? 'none'}::${seat.row_label}`
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key)!.push(seat)
    }
    let bestRun: SeatData[] = []
    const step = scene.pitch + 2
    for (const rowSeats of rows.values()) {
      const sorted = [...rowSeats].sort((a, b) => a.x - b.x)
      let run: SeatData[] = [sorted[0]]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].x - sorted[i - 1].x <= step) run.push(sorted[i])
        else {
          if (run.length >= n && run.length > bestRun.length) bestRun = run.slice(0, n)
          run = [sorted[i]]
        }
      }
      if (run.length >= n && run.length > bestRun.length) bestRun = run.slice(0, n)
    }
    if (bestRun.length === 0) bestRun = available.slice(0, n)
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const s of bestRun) {
        if (next.size >= maxPerOrder) break
        next.add(s.id)
      }
      return next
    })
  }

  // ── Whole-table booking (the gala edge, kept). ──────────────────────────
  const tableGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; seats: SeatData[] }>()
    for (const seat of seats) {
      if (!/(table|booth)/i.test(seat.row_label)) continue
      const key = `${seat.seat_map_section_id ?? 'none'}::${seat.row_label}`
      if (!groups.has(key)) groups.set(key, { key, label: seat.row_label, seats: [] })
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

  /** Price bands for the party control (kept). */
  const priceBands = useMemo(() => {
    const prices = [...new Set(seats.filter(s => s.status === 'available').map(getSeatPrice))].sort(
      (a, b) => a - b,
    )
    if (prices.length <= 1) return []
    if (prices.length <= 5) return prices.map(p => ({ label: formatPrice(p), min: p, max: p }))
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
        setError(result.error)
        setSelectedIds(new Set())
        setGroupUnits([])
        router.refresh()
        return
      }
      if (result.reservation_id) {
        window.location.href = `/checkout/${result.reservation_id}?seat=1`
      }
    })
  }

  /** Schedule rows: every seat-bound tier with its open count. */
  const scheduleRows = useMemo(() => {
    const counts = new Map<string, { open: number; total: number }>()
    for (const seat of seats) {
      if (!seat.ticket_tier_id) continue
      const c = counts.get(seat.ticket_tier_id) ?? { open: 0, total: 0 }
      c.total += 1
      if (seat.status === 'available') c.open += 1
      counts.set(seat.ticket_tier_id, c)
    }
    return tiers
      .filter(t => counts.has(t.id))
      .map(t => ({
        tier: t,
        hue: tierHueMap.get(t.id)!,
        open: counts.get(t.id)!.open,
        total: counts.get(t.id)!.total,
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsKey, tiersKey, tierHueMap])

  const openCount = seats.filter(s => s.status === 'available').length

  const hoverSeat = hover ? seats[hover.index] : null
  const stripSeat = stripIndex != null ? seats[stripIndex] : null

  const viewUrl = viewingSection ? sectionViews[viewingSection.toLowerCase()] : undefined
  const viewingSectionId = viewingSection
    ? sections.find(s => s.name.toLowerCase() === viewingSection.toLowerCase())?.id ?? null
    : null

  if (seats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
        Seats are not yet available for this event.
      </div>
    )
  }

  const seatInfoLine = (seat: SeatData) => {
    const sectionName = sectionNameMap.get(seat.seat_map_section_id ?? '')
    const isTable = /^(table|booth)/i.test(seat.row_label)
    return `${sectionName ? `${sectionName}: ` : ''}${isTable ? seat.row_label : `Row ${seat.row_label}`}, Seat ${seat.seat_number}`
  }

  return (
    <div className="scroll-mt-24 space-y-4" data-testid="seat-selector">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── The sheet ── */}
        <div ref={sheetRef} className="relative lg:min-h-[560px]" data-testid="seat-sheet">
          <SeatCanvas
            ref={canvasRef}
            scene={scene}
            paintKey={paintKey}
            stateFor={stateFor}
            formatPrice={formatPrice}
            hoverIndex={hover?.index ?? null}
            focusIndex={focusIndex}
            groupIndices={groupIndices}
            highlightSectionId={viewingSectionId}
            onSeatActivate={activateSeat}
            onHoverSeat={(index, at) =>
              setHover(index != null && at ? { index, x: at.x, y: at.y } : null)
            }
            onCursorSeat={handleCursor}
            onCursorClear={() => setFocusIndex(null)}
            onCamera={setCameraInfo}
            ariaLabel="Seat map. Arrow keys move seat to seat, Enter selects, plus and minus zoom, Escape rests. Drag to pan, pinch or Ctrl and scroll to zoom."
            className="h-[62vh] min-h-[380px] w-full rounded-xl bg-canvas lg:absolute lg:inset-0 lg:h-full"
            reservedBottomPx={112}
          >
            {/* The floating tooltip (item 6): price, type, exact place. */}
            {hoverSeat && hover && (
              <div
                ref={tooltipRef}
                role="status"
                className="pointer-events-none absolute z-20 hidden min-w-40 rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-lg sm:block"
              >
                <p className="font-display text-sm font-bold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {hoverSeat.status === 'available' ? formatPrice(getSeatPrice(hoverSeat)) : 'Unavailable'}
                </p>
                {hoverSeat.ticket_tier_id && tierById.get(hoverSeat.ticket_tier_id) && (
                  <p
                    className="text-xs font-semibold"
                    style={{ color: tierHueMap.get(hoverSeat.ticket_tier_id) }}
                  >
                    {tierById.get(hoverSeat.ticket_tier_id)!.name}
                  </p>
                )}
                <p className="text-xs text-ink-600">{seatInfoLine(hoverSeat)}</p>
                {selectedIds.has(hoverSeat.id) && (
                  <p className="mt-1 inline-block rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-900">
                    Selected
                  </p>
                )}
              </div>
            )}

            {/* The chrome band: DEAD space the fit reserves, so the key
                plan, the strip and the zoom cluster can never sit over the
                room (the fit keeps every seat above this band). */}
            <div className="absolute inset-x-0 bottom-0 flex h-[112px] items-end justify-between gap-2 px-3 pb-3">
              <KeyPlan
                scene={scene}
                camera={canvasRef.current?.getCamera() ?? { scale: cameraInfo.scale, tx: 0, ty: 0 }}
                viewWidth={canvasRef.current?.getViewSize().width ?? 0}
                viewHeight={canvasRef.current?.getViewSize().height ?? 0}
                width={130}
                height={90}
                onNavigate={(x, y) => canvasRef.current?.centreOnWorld(x, y)}
                className="hidden sm:block"
              />
              <KeyPlan
                scene={scene}
                camera={canvasRef.current?.getCamera() ?? { scale: cameraInfo.scale, tx: 0, ty: 0 }}
                viewWidth={canvasRef.current?.getViewSize().width ?? 0}
                viewHeight={canvasRef.current?.getViewSize().height ?? 0}
                width={92}
                height={64}
                onNavigate={(x, y) => canvasRef.current?.centreOnWorld(x, y)}
                className="sm:hidden"
              />

              {/* The strip: seat detail on touch, in dead space. */}
              <div className="min-w-0 flex-1 self-end pb-1 sm:hidden">
                {stripSeat ? (
                  <p className="truncate text-xs text-ink-900">
                    <span className="font-display font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {stripSeat.status === 'available' ? formatPrice(getSeatPrice(stripSeat)) : 'Unavailable'}
                    </span>
                    <span className="ml-1.5 text-ink-600">{seatInfoLine(stripSeat)}</span>
                    {selectedIds.has(stripSeat.id) && (
                      <span className="ml-1.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-900">
                        Selected
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="truncate text-xs text-ink-600">
                    {cameraInfo.lod === 'overview'
                      ? 'Tap a section to enter the room'
                      : 'Tap a seat for its price and place'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomOut()}
                className="flex h-11 w-11 items-center justify-center rounded-l-lg text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomIn()}
                className="flex h-11 w-11 items-center justify-center text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="h-6 w-px bg-ink-200" aria-hidden="true" />
              <button
                type="button"
                onClick={() => canvasRef.current?.zoomToFit()}
                className="flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-600 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
                aria-label="Zoom to fit"
              >
                <Maximize className="h-3 w-3" aria-hidden />
              </button>
              </div>
            </div>
          </SeatCanvas>
        </div>

        {/* ── The schedule rail ── */}
        <div className="min-w-0 space-y-3">
          {/* The schedule: ticket types as selectable rows (item 9). */}
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                Tickets on this chart
              </p>
              <span
                aria-live="polite"
                className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {openCount} of {seats.length} open
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {scheduleRows.map(row => {
                const active = tierFilter === row.tier.id
                const group = row.tier.min_per_order > 1
                return (
                  <button
                    key={row.tier.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTierFilter(active ? null : row.tier.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                      active ? 'border-ink-900 bg-[#EDF0F4]' : 'border-transparent hover:bg-[#EDF0F4]'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
                      <path d={CHAIR_BACK_PATH} fill="none" stroke={row.hue} strokeWidth={1.8} />
                      <path d={CHAIR_PAN_PATH} fill="none" stroke={row.hue} strokeWidth={1.8} />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink-900">{row.tier.name}</span>
                      {group && (
                        <span className="block text-[11px] text-ink-600">
                          {row.tier.min_per_order} seats together
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(row.tier.price_cents)}
                      </span>
                      <span className="block text-[11px] text-ink-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {row.open} open
                      </span>
                    </span>
                  </button>
                )
              })}
              {scheduleRows.length === 0 && (
                <p className="px-1 py-1 text-xs text-ink-600">
                  Every seat sells at {formatPrice(defaultPriceCents)}.
                </p>
              )}
            </div>
            {/* Seat colours: the colour-vision palette sets (kept). */}
            <div ref={paletteMenuRef} className="relative mt-2 border-t border-ink-100 pt-2">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={paletteMenuOpen}
                onClick={() => setPaletteMenuOpen(open => !open)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <span aria-hidden className="flex items-center">
                  {SEAT_PALETTE_SETS[paletteSet].slice(0, 3).map((tone, i) => (
                    <span
                      key={tone}
                      className="h-2.5 w-2.5 rounded-full border border-white"
                      style={{ backgroundColor: tone, marginLeft: i === 0 ? 0 : '-3px' }}
                    />
                  ))}
                </span>
                Seat colours
              </button>
              {paletteMenuOpen && (
                <div
                  role="menu"
                  aria-label="Seat colour sets"
                  className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg"
                >
                  {SEAT_PALETTE_SET_META.map(meta => (
                    <button
                      key={meta.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={paletteSet === meta.id}
                      onClick={() => {
                        setPaletteSet(meta.id)
                        setPaletteMenuOpen(false)
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                        paletteSet === meta.id ? 'bg-[#EDF0F4]' : 'hover:bg-[#EDF0F4]'
                      }`}
                    >
                      <span aria-hidden className="flex shrink-0 items-center">
                        {SEAT_PALETTE_SETS[meta.id].slice(0, 4).map(tone => (
                          <svg key={tone} viewBox="0 0 24 24" className="-ml-1 h-3.5 w-3.5 first:ml-0" aria-hidden>
                            <path d={CHAIR_BACK_PATH} fill="none" stroke={tone} strokeWidth={2.2} />
                            <path d={CHAIR_PAN_PATH} fill="none" stroke={tone} strokeWidth={2.2} />
                          </svg>
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-ink-900">{meta.label}</span>
                        <span className="block text-[11px] text-ink-600">{meta.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* The ONE control: party size, price band, one action (kept). */}
          <div role="group" aria-label="Find seats together under your price" className="rounded-xl border border-ink-200 bg-white p-3">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
              Seats together
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="inline-flex items-center gap-1" role="group" aria-label="Party size">
                <button
                  type="button"
                  aria-label="One fewer person"
                  disabled={partySize <= 1}
                  onClick={() => setPartySize(n => Math.max(1, n - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-sm font-bold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  −
                </button>
                <span
                  aria-live="polite"
                  className="min-w-11 text-center font-display text-sm font-bold text-ink-900"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {partySize} {partySize === 1 ? 'seat' : 'of us'}
                </span>
                <button
                  type="button"
                  aria-label="One more person"
                  disabled={partySize >= maxPerOrder}
                  onClick={() => setPartySize(n => Math.min(maxPerOrder, n + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-sm font-bold text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  +
                </button>
              </div>
              {priceBands.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Under this price">
                  <button
                    type="button"
                    aria-pressed={priceFilter === null}
                    onClick={() => setPriceFilter(null)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                      priceFilter === null
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : 'border-ink-200 bg-white text-ink-600 hover:border-gold-500 hover:text-ink-900'
                    }`}
                  >
                    Any price
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
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
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
            </div>
            <button
              type="button"
              disabled={pickPending}
              onClick={() => {
                setSelectedIds(new Set())
                setGroupUnits([])
                void pickBestAvailable(partySize)
              }}
              className="mt-2.5 w-full rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 shadow-sm transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              {pickPending ? 'Finding your seats…' : partySize === 1 ? 'Find my seat' : 'Find our seats'}
            </button>
            {pickNote && (
              <p aria-live="polite" className="mt-2 text-xs text-ink-600">
                {pickNote}
              </p>
            )}
          </div>

          {/* Whole-table booking (kept). */}
          {tableGroups.length > 0 && (
            <div className="rounded-xl border border-gold-500/30 bg-white p-3">
              <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                Book a whole table
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tableGroups.map(group => {
                  const available = group.seats.filter(s => s.status === 'available')
                  const selectedHere = available.filter(s => selectedIds.has(s.id)).length
                  const fullTableSelected = available.length > 0 && selectedHere === available.length
                  const soldOut = available.length === 0
                  const label = soldOut
                    ? `${group.label} · full`
                    : fullTableSelected
                      ? `${group.label} · yours`
                      : `${group.label} · ${available.length} open`
                  return (
                    <button
                      key={group.key}
                      type="button"
                      disabled={soldOut}
                      aria-pressed={fullTableSelected}
                      onClick={() => toggleTable(group)}
                      className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                        fullTableSelected
                          ? 'border-ink-900 bg-gold-500 text-ink-900'
                          : 'border-ink-200 bg-white text-ink-900 hover:border-gold-500'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* The orphan nudge (kept): advisory, never a wall. */}
          {strandedBySelection.length > 0 && (
            <div role="status" className="rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-2.5">
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
                className="mt-1.5 rounded-full border border-ink-900 bg-white px-3 py-1 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                Sit us together, best spot
              </button>
            </div>
          )}

          {/* View from seat: anchored IN the seating context, never a
              lightbox. The photo card lives in the rail (desktop) or
              inline under the sheet (mobile); the section's polygon
              lights up on the sheet while it is open. */}
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
              The view from your section
            </p>
            {Object.keys(sectionViews).length === 0 ? (
              <p className="mt-1.5 text-xs text-ink-400">
                No section photos yet for this room.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sections
                  .filter(s => sectionViews[s.name.toLowerCase()])
                  .map(s => {
                    const active = viewingSection?.toLowerCase() === s.name.toLowerCase()
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setViewingSection(active ? null : s.name)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                          active
                            ? 'border-ink-900 bg-ink-900 text-white'
                            : 'border-ink-200 bg-white text-ink-900 hover:border-gold-500'
                        }`}
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden />
                        {s.name}
                      </button>
                    )
                  })}
              </div>
            )}
            {viewingSection && viewUrl && (
              <figure className="mt-2.5 overflow-hidden rounded-lg border border-ink-200">
                <div className="relative aspect-[3/2]">
                  <SectionViewImage
                    src={viewUrl}
                    alt={`The view from ${viewingSection}, photographed in the room`}
                  />
                  <button
                    type="button"
                    aria-label="Close the view photo"
                    onClick={() => setViewingSection(null)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <figcaption className="border-t-2 border-gold-500 bg-white px-3 py-2">
                  <span className="block text-xs font-bold uppercase tracking-[0.08em] text-ink-900">
                    The view from {viewingSection}
                  </span>
                  <span className="block text-[11px] text-ink-600">
                    Photographed from this section, not a render. Its area is lit on the plan.
                  </span>
                </figcaption>
              </figure>
            )}
          </div>

          {/* Selection summary + proceed (kept flow). */}
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            {selectedIds.size === 0 ? (
              <p className="py-1 text-center text-xs text-ink-400">
                Tap seats on the plan to select them
              </p>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  {selectedSeats.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="min-w-0 truncate text-ink-600">{seatInfoLine(s)}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5">
                        <span className="font-semibold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatPrice(getSeatPrice(s))}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove row ${s.row_label} seat ${s.seat_number}`}
                          onClick={() => deselectSeat(s.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-ink-100 pt-2">
                  <div>
                    <p className="text-[11px] text-ink-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {selectedIds.size} seat{selectedIds.size !== 1 ? 's' : ''}
                    </p>
                    <p className="font-display text-base font-bold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(totalCents)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds(new Set())
                      setGroupUnits([])
                    }}
                    className="rounded text-xs font-medium text-ink-400 transition-colors hover:text-ink-900 hover:underline decoration-gold-500 decoration-2 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleProceed}
              disabled={selectedIds.size === 0 || isPending}
              className="mt-3 w-full rounded-xl bg-gold-500 py-3 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-gold-600 hover:shadow-md disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
            >
              {isPending
                ? 'Reserving seats…'
                : selectedIds.size === 0
                  ? 'Select seats to continue'
                  : `Reserve ${selectedIds.size} seat${selectedIds.size !== 1 ? 's' : ''} · ${formatPrice(totalCents)}`}
            </button>
          </div>
        </div>
      </div>

      {/* The keyboard cursor's voice. */}
      <span aria-live="polite" className="sr-only">
        {keyboardNote}
      </span>
    </div>
  )
}
