/**
 * Best-available v2 (S1): the server-side seat assignment core.
 *
 * Pure functions, no I/O: the server action feeds seats and the chart's
 * layout in; a ranked pick comes out. The reference bar is the specialist
 * cascade (contiguous first, graceful degradation, orphan prevention on by
 * default, accessible and companion mixing in one request, focal-point
 * proximity as the definition of "best"), built to the founder's mandated
 * order: contiguous rows, then scattered, then whole table, then GA.
 *
 * Focal point resolution needs NO migration: an explicit `focal` in the
 * chart layout wins; otherwise a scenery area labelled as a stage anchors
 * it; otherwise the top-centre of the plan (the stage band every chart
 * draws) stands in. Every existing chart gets a working focal point today.
 *
 * Orphan prevention: a pick may not strand a single available seat at
 * either end of a row segment (the universally named revenue leak). Within
 * a contiguous run the chosen window must leave zero or at least two open
 * seats on each side.
 */

export interface BASeat {
  id: string
  section_id: string | null
  row_label: string
  seat_number: string
  x: number
  y: number
  status: string
  seat_type: string
}

export interface FocalPoint {
  x: number
  y: number
}

export interface BestAvailableInput {
  seats: BASeat[]
  quantity: number
  focal: FocalPoint
  /** Wheelchair spaces wanted inside the quantity (mixed request). */
  accessibleNeeded?: number
  /** Orphan-seat prevention. ON unless explicitly disabled. */
  preventOrphans?: boolean
}

export type BestAvailableStrategy =
  | 'contiguous'
  | 'contiguous-with-orphan'
  | 'scattered'
  | 'table'
  | 'ga'
  | 'none'

export interface BestAvailableResult {
  seatIds: string[]
  strategy: BestAvailableStrategy
}

/** A seat is takeable when open and of a sellable type for this request. */
function isOpen(seat: BASeat): boolean {
  return seat.status === 'available'
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Whole-table rows sell as one unit (the existing map convention). */
function isTableRow(rowLabel: string): boolean {
  return /table|booth/i.test(rowLabel)
}

type Row = {
  key: string
  seats: BASeat[] // ALL seats of the row (any status), sorted along the row axis
}

/** Group by section + row and sort each row along its principal axis. */
function buildRows(seats: BASeat[]): Row[] {
  const byRow = new Map<string, BASeat[]>()
  for (const seat of seats) {
    const key = `${seat.section_id ?? 'none'}::${seat.row_label}`
    const bucket = byRow.get(key)
    if (bucket) bucket.push(seat)
    else byRow.set(key, [seat])
  }
  const rows: Row[] = []
  for (const [key, rowSeats] of byRow) {
    const xs = rowSeats.map(s => s.x)
    const ys = rowSeats.map(s => s.y)
    const spreadX = Math.max(...xs) - Math.min(...xs)
    const spreadY = Math.max(...ys) - Math.min(...ys)
    const sorted = [...rowSeats].sort(
      spreadX >= spreadY ? (a, b) => a.x - b.x : (a, b) => a.y - b.y,
    )
    rows.push({ key, seats: sorted })
  }
  return rows
}

/**
 * Split one sorted row into physically contiguous segments. The aisle
 * threshold self-calibrates: 1.6 times the row's median seat-to-seat step,
 * so custom spacing and curved rows never fool it.
 */
function rowSegments(row: Row): BASeat[][] {
  const seats = row.seats
  if (seats.length <= 1) return [seats]
  const steps: number[] = []
  for (let i = 1; i < seats.length; i++) steps.push(dist(seats[i - 1], seats[i]))
  const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)]
  const threshold = Math.max(median * 1.6, 1)
  const segments: BASeat[][] = []
  let current: BASeat[] = [seats[0]]
  for (let i = 1; i < seats.length; i++) {
    if (steps[i - 1] <= threshold) current.push(seats[i])
    else {
      segments.push(current)
      current = [seats[i]]
    }
  }
  segments.push(current)
  return segments
}

/** Open runs (maximal stretches of open seats) within a physical segment. */
function openRuns(segment: BASeat[]): { start: number; length: number }[] {
  const runs: { start: number; length: number }[] = []
  let start = -1
  segment.forEach((seat, i) => {
    if (isOpen(seat)) {
      if (start === -1) start = i
    } else if (start !== -1) {
      runs.push({ start, length: i - start })
      start = -1
    }
  })
  if (start !== -1) runs.push({ start, length: segment.length - start })
  return runs
}

function centroid(seats: BASeat[]): { x: number; y: number } {
  const n = seats.length
  return {
    x: seats.reduce((s, seat) => s + seat.x, 0) / n,
    y: seats.reduce((s, seat) => s + seat.y, 0) / n,
  }
}

/**
 * The best n-seat window inside every open run, ranked by focal distance.
 * With orphan prevention a window is admissible only when it leaves 0 or
 * >= 2 open seats on EACH side of itself within its run.
 */
function bestContiguousWindow(
  rows: Row[],
  quantity: number,
  focal: FocalPoint,
  preventOrphans: boolean,
): BASeat[] | null {
  let best: { seats: BASeat[]; score: number } | null = null
  for (const row of rows) {
    if (isTableRow(row.seats[0]?.row_label ?? '')) continue
    for (const segment of rowSegments(row)) {
      for (const run of openRuns(segment)) {
        if (run.length < quantity) continue
        for (let offset = 0; offset + quantity <= run.length; offset++) {
          const leftGap = offset
          const rightGap = run.length - quantity - offset
          if (preventOrphans && (leftGap === 1 || rightGap === 1)) continue
          const windowSeats = segment.slice(run.start + offset, run.start + offset + quantity)
          const score = dist(centroid(windowSeats), focal)
          if (!best || score < best.score) best = { seats: windowSeats, score }
        }
      }
    }
  }
  return best?.seats ?? null
}

/** Nearest open seats to a point, optionally excluding some ids. */
function nearestOpen(
  seats: BASeat[],
  point: { x: number; y: number },
  quantity: number,
  exclude: Set<string> = new Set(),
): BASeat[] {
  return seats
    .filter(s => isOpen(s) && !exclude.has(s.id) && !isTableRow(s.row_label))
    .sort((a, b) => dist(a, point) - dist(b, point))
    .slice(0, quantity)
}

/** The whole-table leg: the closest table with enough open seats. */
function bestTable(rows: Row[], quantity: number, focal: FocalPoint): BASeat[] | null {
  let best: { seats: BASeat[]; waste: number; score: number } | null = null
  for (const row of rows) {
    if (!isTableRow(row.seats[0]?.row_label ?? '')) continue
    const open = row.seats.filter(isOpen)
    if (open.length < quantity) continue
    const waste = open.length - quantity
    const score = dist(centroid(open), focal)
    if (!best || waste < best.waste || (waste === best.waste && score < best.score)) {
      best = { seats: open.slice(0, quantity), waste, score }
    }
  }
  return best?.seats ?? null
}

/**
 * Mixed accessibility: the wheelchair spaces closest to the focal point,
 * companions beside them when present, and the rest of the party clustered
 * around the accessible picks rather than stranded across the room.
 */
function accessiblePick(
  seats: BASeat[],
  quantity: number,
  accessibleNeeded: number,
  focal: FocalPoint,
): BASeat[] | null {
  const accessible = seats
    .filter(s => isOpen(s) && s.seat_type === 'accessible')
    .sort((a, b) => dist(a, focal) - dist(b, focal))
    .slice(0, accessibleNeeded)
  if (accessible.length < accessibleNeeded) return null

  const picked = new Set(accessible.map(s => s.id))
  const anchor = centroid(accessible)
  const rest: BASeat[] = []
  const restNeeded = quantity - accessible.length
  if (restNeeded > 0) {
    // Companions beside the accessible seats come first, then the nearest
    // open seats clustered on the party's anchor.
    const companions = seats
      .filter(s => isOpen(s) && s.seat_type === 'companion' && !picked.has(s.id))
      .sort((a, b) => dist(a, anchor) - dist(b, anchor))
      .slice(0, restNeeded)
    companions.forEach(s => picked.add(s.id))
    rest.push(...companions)
    if (rest.length < restNeeded) {
      rest.push(...nearestOpen(seats, anchor, restNeeded - rest.length, picked))
    }
    if (rest.length < restNeeded) return null
  }
  return [...accessible, ...rest]
}

/**
 * The cascade. Returns the picked seat ids and which leg produced them;
 * `ga` signals that only a general admission zone can host the party
 * (no seats are returned for it: GA sells through its tier).
 */
export function pickBestAvailable(input: BestAvailableInput): BestAvailableResult {
  const { seats, quantity, focal } = input
  const preventOrphans = input.preventOrphans !== false
  const accessibleNeeded = Math.max(0, Math.min(input.accessibleNeeded ?? 0, quantity))

  if (quantity <= 0 || seats.length === 0) return { seatIds: [], strategy: 'none' }

  // Accessibility-mixed requests take their own path: proximity to the
  // wheelchair space outranks every other preference.
  if (accessibleNeeded > 0) {
    const picked = accessiblePick(seats, quantity, accessibleNeeded, focal)
    return picked
      ? { seatIds: picked.map(s => s.id), strategy: 'scattered' }
      : { seatIds: [], strategy: 'none' }
  }

  const rows = buildRows(seats)

  // 1. Contiguous, no orphans stranded.
  const contiguous = bestContiguousWindow(rows, quantity, focal, preventOrphans)
  if (contiguous) return { seatIds: contiguous.map(s => s.id), strategy: 'contiguous' }

  // 2. Contiguous, orphans tolerated (better together than apart).
  if (preventOrphans) {
    const relaxed = bestContiguousWindow(rows, quantity, focal, false)
    if (relaxed) return { seatIds: relaxed.map(s => s.id), strategy: 'contiguous-with-orphan' }
  }

  // 3. Scattered: the nearest open seats to the focal point.
  const scattered = nearestOpen(seats, focal, quantity)
  if (scattered.length >= quantity) {
    return { seatIds: scattered.map(s => s.id), strategy: 'scattered' }
  }

  // 4. A whole table that can host the party.
  const table = bestTable(rows, quantity, focal)
  if (table) return { seatIds: table.map(s => s.id), strategy: 'table' }

  // 5. Nothing seated fits; the GA zone (when the event has one) is the
  //    honest answer, signalled without pretending seats were found.
  return { seatIds: [], strategy: 'ga' }
}

/**
 * S2: the buyer-selection orphan guard. Returns every open seat that the
 * given selection leaves stranded (no open neighbour within its physical
 * row segment). Callers diff against the empty selection so seats that
 * were already isolated before the buyer touched anything never nag.
 */
export function findStrandedOrphans(seats: BASeat[], selectedIds: Set<string>): BASeat[] {
  const open = (s: BASeat) => isOpen(s) && !selectedIds.has(s.id)
  const orphans: BASeat[] = []
  for (const row of buildRows(seats)) {
    if (isTableRow(row.seats[0]?.row_label ?? '')) continue
    for (const segment of rowSegments(row)) {
      segment.forEach((seat, i) => {
        if (!open(seat)) return
        const leftOpen = i > 0 && open(segment[i - 1])
        const rightOpen = i < segment.length - 1 && open(segment[i + 1])
        if (!leftOpen && !rightOpen && segment.length > 1) orphans.push(seat)
      })
    }
  }
  return orphans
}

/** The orphans a buyer's CURRENT selection creates (pre-existing ones excluded). */
export function selectionCreatedOrphans(seats: BASeat[], selectedIds: Set<string>): BASeat[] {
  if (selectedIds.size === 0) return []
  const before = new Set(findStrandedOrphans(seats, new Set()).map(s => s.id))
  return findStrandedOrphans(seats, selectedIds).filter(s => !before.has(s.id))
}

/**
 * Focal point for a chart, no migration required: explicit layout focal ->
 * a scenery area named like a stage -> the top-centre of the seat field.
 */
export function resolveFocalPoint(
  layout: {
    focal?: { x?: unknown; y?: unknown } | null
    areas?: { label?: string | null; style?: string | null; x: number; y: number; width?: number; height?: number }[]
  } | null,
  seats: { x: number; y: number }[],
): FocalPoint {
  const explicit = layout?.focal
  if (explicit && typeof explicit.x === 'number' && typeof explicit.y === 'number') {
    return { x: explicit.x, y: explicit.y }
  }
  const stage = layout?.areas?.find(
    a => a.style === 'scenery' && /stage/i.test(a.label ?? ''),
  )
  if (stage) {
    return {
      x: stage.x + (stage.width ?? 0) / 2,
      y: stage.y + (stage.height ?? 0) / 2,
    }
  }
  if (seats.length === 0) return { x: 0, y: 0 }
  const xs = seats.map(s => s.x)
  const ys = seats.map(s => s.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - 40 }
}
