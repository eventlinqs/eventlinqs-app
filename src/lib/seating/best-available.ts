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
  /** Seat price in cents, when the caller wants price-banded picking. */
  price_cents?: number | null
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
  /**
   * The price band, in cents: the ONE control's "under this price". Seats
   * priced outside the band cannot be picked; they still split rows the
   * way a sold seat does, and the true orphan accounting (the quality
   * score) always runs on the real room, so a price-banded pick stays
   * orphan-safe against every seat, not just the affordable ones.
   */
  maxPriceCents?: number
  minPriceCents?: number
}

export type BestAvailableStrategy =
  | 'contiguous'
  | 'contiguous-with-orphan'
  | 'scattered'
  | 'table'
  | 'ga'
  | 'none'

/**
 * The quality of a pick, scored on the three things a buyer actually
 * feels: whether the party sits together (contiguity), how close to the
 * action they sit (focal proximity), and whether the pick wrecked the room
 * for the next buyer (orphans created). The composite is 0 to 100.
 */
export interface PickQuality {
  /**
   * The largest contiguous picked block over the party size: 1 = the whole
   * party together, 0.5 = a four split into pairs, approaching 0 =
   * scattered singles. Split pairs never masquerade as together.
   */
  contiguity: number
  /** Mean distance from the focal point, normalised 0 (at focal) to 1 (farthest seat). */
  focalDistance: number
  /** Stranded singles this pick creates that did not exist before. */
  orphansCreated: number
  /**
   * 0 to 100. The buyer-felt base (55% contiguity, 45% focal proximity)
   * multiplied by 0.7 per orphan created: an orphan is a defect of the
   * pick as a WHOLE (the platform's cascade treats orphan-freedom
   * lexicographically), so it scales the score rather than nibbling it.
   */
  composite: number
}

export interface BestAvailableResult {
  seatIds: string[]
  strategy: BestAvailableStrategy
  /** Present whenever seats were picked: the scored quality of the pick. */
  quality?: PickQuality
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
/**
 * Every admissible window of the given size, ranked by distance from the
 * anchor, capped at `limit`. The exclusion set makes an already picked
 * seat split a run exactly like a sold one.
 */
function topContiguousWindows(
  rows: Row[],
  quantity: number,
  anchor: { x: number; y: number },
  preventOrphans: boolean,
  exclude: Set<string>,
  limit: number,
): BASeat[][] {
  const found: { seats: BASeat[]; score: number }[] = []
  const open = (s: BASeat) => isOpen(s) && !exclude.has(s.id)
  for (const row of rows) {
    if (isTableRow(row.seats[0]?.row_label ?? '')) continue
    for (const segment of rowSegments(row)) {
      const runs: { start: number; length: number }[] = []
      let start = -1
      segment.forEach((seat, i) => {
        if (open(seat)) {
          if (start === -1) start = i
        } else if (start !== -1) {
          runs.push({ start, length: i - start })
          start = -1
        }
      })
      if (start !== -1) runs.push({ start, length: segment.length - start })

      for (const run of runs) {
        if (run.length < quantity) continue
        for (let offset = 0; offset + quantity <= run.length; offset++) {
          const leftGap = offset
          const rightGap = run.length - quantity - offset
          if (preventOrphans && (leftGap === 1 || rightGap === 1)) continue
          const windowSeats = segment.slice(run.start + offset, run.start + offset + quantity)
          found.push({ seats: windowSeats, score: dist(centroid(windowSeats), anchor) })
        }
      }
    }
  }
  found.sort((a, b) => a.score - b.score)
  return found.slice(0, limit).map(f => f.seats)
}

function bestContiguousWindow(
  rows: Row[],
  quantity: number,
  focal: FocalPoint,
  preventOrphans: boolean,
  exclude: Set<string> = new Set(),
): BASeat[] | null {
  return topContiguousWindows(rows, quantity, focal, preventOrphans, exclude, 1)[0] ?? null
}

/**
 * Complete a partial pick greedily: largest nearby groups, then singles.
 * The remainder singles anchor either on the party (sit near your group)
 * or on the focal point (the odd one out gets the best seat); the caller
 * scores both and keeps the winner.
 */
function completeSplit(
  seats: BASeat[],
  rows: Row[],
  firstGroup: BASeat[],
  quantity: number,
  focal: FocalPoint,
  singlesNear: 'group' | 'focal',
): BASeat[] | null {
  const picked = [...firstGroup]
  const pickedIds = new Set(firstGroup.map(s => s.id))
  let remaining = quantity - picked.length
  let anchor = centroid(picked)

  while (remaining > 1) {
    let window: BASeat[] | null = null
    for (let size = remaining; size >= 2 && !window; size--) {
      window =
        topContiguousWindows(rows, size, anchor, true, pickedIds, 1)[0] ??
        topContiguousWindows(rows, size, anchor, false, pickedIds, 1)[0] ??
        null
    }
    if (!window) break
    for (const seat of window) {
      pickedIds.add(seat.id)
      picked.push(seat)
    }
    remaining -= window.length
    anchor = centroid(picked)
  }

  if (remaining > 0) {
    const singleAnchor = singlesNear === 'group' ? anchor : focal
    const singles = nearestOpen(seats, singleAnchor, remaining, pickedIds)
    if (singles.length < remaining) return null
    picked.push(...singles)
  }
  return picked.length === quantity ? picked : null
}

/**
 * The best-split leg: when no single window can hold the party, seat it in
 * the FEWEST groups instead of spraying singles at the focal point. A
 * small deterministic beam: the leading windows of every feasible group
 * size seed a candidate split each, every candidate is completed greedily
 * around its own centroid, and the pick quality score itself judges the
 * winner, so the algorithm optimises exactly what the platform measures.
 */
function bestSplitPick(
  seats: BASeat[],
  rows: Row[],
  quantity: number,
  focal: FocalPoint,
  scoringSeats: BASeat[] = seats,
): BASeat[] | null {
  const none = new Set<string>()
  const seen = new Set<string>()
  let best: { pick: BASeat[]; composite: number } | null = null

  for (let size = quantity - 1; size >= 2; size--) {
    const seeds = [
      ...topContiguousWindows(rows, size, focal, true, none, 4),
      ...topContiguousWindows(rows, size, focal, false, none, 2),
    ]
    for (const seed of seeds) {
      const signature = seed.map(s => s.id).sort().join('|')
      if (seen.has(signature)) continue
      seen.add(signature)
      for (const singlesNear of ['group', 'focal'] as const) {
        const pick = completeSplit(seats, rows, seed, quantity, focal, singlesNear)
        if (!pick) continue
        const quality = scorePick(scoringSeats, pick.map(s => s.id), focal)
        if (!best || quality.composite > best.composite) {
          best = { pick, composite: quality.composite }
        }
      }
    }
  }
  return best?.pick ?? null
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
 * Score a pick on contiguity, focal proximity and orphans created.
 * Pure and deterministic: the reproducible proof that the cascade beats a
 * naive row-fill lives on this function.
 */
export function scorePick(
  seats: BASeat[],
  pickedIds: string[],
  focal: FocalPoint,
): PickQuality {
  const picked = new Set(pickedIds)
  const pickedSeats = seats.filter(s => picked.has(s.id))
  if (pickedSeats.length === 0) {
    return { contiguity: 0, focalDistance: 1, orphansCreated: 0, composite: 0 }
  }

  // Contiguity: the largest run of picked seats sitting directly beside
  // each other within one physical row segment, over the party size. A
  // party of one is together by definition; a four split into two pairs
  // scores 0.5, never 1.
  let largestRun = pickedSeats.length === 1 ? 1 : 0
  if (pickedSeats.length > 1) {
    for (const row of buildRows(seats)) {
      for (const segment of rowSegments(row)) {
        let run = 0
        for (const seat of segment) {
          if (picked.has(seat.id)) {
            run += 1
            if (run > largestRun) largestRun = run
          } else {
            run = 0
          }
        }
      }
    }
    largestRun = Math.max(largestRun, 1) // every picked seat is at least its own block
  }
  const contiguity = largestRun / pickedSeats.length

  // Focal proximity: the party's mean distance, normalised by the farthest
  // seat in the room so the score is chart-scale independent.
  const maxDist = Math.max(1, ...seats.map(s => dist(s, focal)))
  const meanDist =
    pickedSeats.reduce((sum, s) => sum + dist(s, focal), 0) / pickedSeats.length
  const focalDistance = Math.min(1, meanDist / maxDist)

  const orphansCreated = selectionCreatedOrphans(seats, picked).length

  const base = 0.55 * contiguity + 0.45 * (1 - focalDistance)
  const composite = 100 * base * Math.pow(0.7, orphansCreated)

  return {
    contiguity: +contiguity.toFixed(3),
    focalDistance: +focalDistance.toFixed(3),
    orphansCreated,
    composite: +composite.toFixed(1),
  }
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

  // The price band masks unaffordable seats as un-pickable (they split
  // rows exactly like sold seats), while every quality score below still
  // runs on the REAL room, so true orphan accounting is never fooled.
  const banded = input.maxPriceCents != null || input.minPriceCents != null
  const inBand = (s: BASeat) => {
    const price = s.price_cents ?? 0
    if (input.maxPriceCents != null && price > input.maxPriceCents) return false
    if (input.minPriceCents != null && price < input.minPriceCents) return false
    return true
  }
  const workingSeats = banded
    ? seats.map(s => (s.status === 'available' && !inBand(s) ? { ...s, status: 'reserved' } : s))
    : seats

  // An under-supplied band is an honest "nothing fits", never a GA shrug.
  if (banded && workingSeats.filter(isOpen).length < quantity) {
    return { seatIds: [], strategy: 'none' }
  }

  const withQuality = (
    ids: string[],
    strategy: BestAvailableStrategy,
  ): BestAvailableResult => ({
    seatIds: ids,
    strategy,
    quality: scorePick(seats, ids, focal),
  })

  // Accessibility-mixed requests take their own path: proximity to the
  // wheelchair space outranks every other preference.
  if (accessibleNeeded > 0) {
    const picked = accessiblePick(workingSeats, quantity, accessibleNeeded, focal)
    return picked
      ? withQuality(picked.map(s => s.id), 'scattered')
      : { seatIds: [], strategy: 'none' }
  }

  const rows = buildRows(workingSeats)

  // 1. Contiguous, no orphans stranded.
  const contiguous = bestContiguousWindow(rows, quantity, focal, preventOrphans)
  if (contiguous) return withQuality(contiguous.map(s => s.id), 'contiguous')

  // 2. Contiguous, orphans tolerated (better together than apart).
  if (preventOrphans) {
    const relaxed = bestContiguousWindow(rows, quantity, focal, false)
    if (relaxed) return withQuality(relaxed.map(s => s.id), 'contiguous-with-orphan')
  }

  // 3. Scattered, done properly: the fewest groups that hold the party,
  //    anchored on each other, singles only as the remainder.
  const split = bestSplitPick(workingSeats, rows, quantity, focal, seats)
  if (split) return withQuality(split.map(s => s.id), 'scattered')

  const scattered = nearestOpen(workingSeats, focal, quantity)
  if (scattered.length >= quantity) {
    return withQuality(scattered.map(s => s.id), 'scattered')
  }

  // 4. A whole table that can host the party.
  const table = bestTable(rows, quantity, focal)
  if (table) return withQuality(table.map(s => s.id), 'table')

  // 5. Nothing seated fits; the GA zone (when the event has one) is the
  //    honest answer, signalled without pretending seats were found.
  return { seatIds: [], strategy: 'ga' }
}

/**
 * Group tickets: the contiguous window of `quantity` open seats that
 * contains the anchor seat, orphan-admissible when the row allows it.
 * The caller passes the GROUP TIER's seats only, so the window can never
 * mix ticket types. Preference order: orphan-safe windows first, then the
 * window whose centre sits closest to the anchor, so the tapped seat
 * anchors its party naturally. Null when the anchor's run cannot hold the
 * group.
 */
export function contiguousGroupWindow(
  seats: BASeat[],
  anchorId: string,
  quantity: number,
): string[] | null {
  if (quantity <= 0) return null
  for (const row of buildRows(seats)) {
    for (const segment of rowSegments(row)) {
      const anchorIdx = segment.findIndex(s => s.id === anchorId)
      if (anchorIdx === -1) continue
      if (!isOpen(segment[anchorIdx])) return null
      // The maximal open run containing the anchor.
      let start = anchorIdx
      while (start > 0 && isOpen(segment[start - 1])) start--
      let end = anchorIdx
      while (end < segment.length - 1 && isOpen(segment[end + 1])) end++
      const runLength = end - start + 1
      if (runLength < quantity) return null

      let best: { ids: string[]; safe: boolean; offCentre: number } | null = null
      for (let w = Math.max(start, anchorIdx - quantity + 1); w + quantity - 1 <= end && w <= anchorIdx; w++) {
        const leftGap = w - start
        const rightGap = end - (w + quantity - 1)
        const safe = leftGap !== 1 && rightGap !== 1
        const offCentre = Math.abs(w + (quantity - 1) / 2 - anchorIdx)
        if (
          !best ||
          (safe && !best.safe) ||
          (safe === best.safe && offCentre < best.offCentre)
        ) {
          best = { ids: segment.slice(w, w + quantity).map(s => s.id), safe, offCentre }
        }
      }
      return best?.ids ?? null
    }
  }
  return null
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
 * the stage GEOMETRY's apron midpoint -> a scenery area named like a stage
 * -> the top-centre of the seat field.
 */
export function resolveFocalPoint(
  layout: {
    focal?: { x?: unknown; y?: unknown } | null
    stage?: { x?: unknown; y?: unknown; width?: unknown; depth?: unknown } | null
    areas?: { label?: string | null; style?: string | null; x: number; y: number; width?: number; height?: number }[]
  } | null,
  seats: { x: number; y: number }[],
): FocalPoint {
  const explicit = layout?.focal
  if (explicit && typeof explicit.x === 'number' && typeof explicit.y === 'number') {
    return { x: explicit.x, y: explicit.y }
  }
  // The stage as geometry (the rebuilt charts): the apron midpoint is the
  // definition of "best". The house sits below the stage box.
  const stageGeo = layout?.stage
  if (
    stageGeo &&
    typeof stageGeo.x === 'number' &&
    typeof stageGeo.y === 'number' &&
    typeof stageGeo.width === 'number' &&
    typeof stageGeo.depth === 'number'
  ) {
    return { x: stageGeo.x + stageGeo.width / 2, y: stageGeo.y + stageGeo.depth }
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
