/**
 * Chart-versus-live diff: the pure preview of exactly what
 * `rematerialize_seats_additive` will do, computed BEFORE anything
 * commits, so the organiser reads the change and its protections first.
 *
 * Mirrors the RPC's semantics precisely:
 *  - identity = (section name, row label, seat number)
 *  - a layout identity with no live seat: ADDED
 *  - a live available/blocked seat matched in the layout: FOLLOWS the
 *    chart (position, type, tier); counted as a move only when something
 *    visible actually changes
 *  - a live available/blocked seat missing from the layout: REMOVED
 *  - a live reserved/sold/held seat: PROTECTED, never touched beyond a
 *    coordinate refresh; if missing from the layout it is KEPT anyway
 */

export interface LiveSeatForDiff {
  section_name: string | null
  row_label: string
  seat_number: string
  status: string
  seat_type: string
  x: number
  y: number
}

export interface DiffSeatRef {
  section: string
  row: string
  number: string
}

export interface ChartDiff {
  added: DiffSeatRef[]
  moved: DiffSeatRef[]
  removed: DiffSeatRef[]
  /** Live reserved/sold/held seats: never touched by the sync. */
  protectedSeats: (DiffSeatRef & { status: string })[]
  /** Protected seats the new chart no longer contains: kept anyway. */
  protectedMissing: (DiffSeatRef & { status: string })[]
  unchanged: number
}

interface LayoutForDiff {
  sections?: {
    name: string
    rows?: {
      label: string
      seats?: { number: string; type?: string; blocked?: boolean; x: number; y: number }[]
    }[]
  }[]
}

const PROTECTED_STATUSES = new Set(['reserved', 'sold', 'held'])

function key(section: string | null, row: string, number: string): string {
  return `${(section ?? '').toLowerCase()}|${row}|${number}`
}

export function diffChartAgainstLive(
  layout: LayoutForDiff | null,
  liveSeats: LiveSeatForDiff[],
): ChartDiff {
  const diff: ChartDiff = {
    added: [],
    moved: [],
    removed: [],
    protectedSeats: [],
    protectedMissing: [],
    unchanged: 0,
  }

  const liveByKey = new Map<string, LiveSeatForDiff>()
  for (const seat of liveSeats) {
    liveByKey.set(key(seat.section_name, seat.row_label, seat.seat_number), seat)
  }

  const layoutKeys = new Set<string>()
  for (const section of layout?.sections ?? []) {
    for (const row of section.rows ?? []) {
      for (const seat of row.seats ?? []) {
        const k = key(section.name, row.label, seat.number)
        layoutKeys.add(k)
        const live = liveByKey.get(k)
        const ref: DiffSeatRef = { section: section.name, row: row.label, number: seat.number }
        if (!live) {
          diff.added.push(ref)
          continue
        }
        if (PROTECTED_STATUSES.has(live.status)) {
          diff.protectedSeats.push({ ...ref, status: live.status })
          continue
        }
        const layoutStatus = seat.blocked ? 'blocked' : 'available'
        const changed =
          Math.abs(live.x - seat.x) > 0.01 ||
          Math.abs(live.y - seat.y) > 0.01 ||
          live.seat_type !== (seat.type ?? 'standard') ||
          live.status !== layoutStatus
        if (changed) diff.moved.push(ref)
        else diff.unchanged += 1
      }
    }
  }

  for (const seat of liveSeats) {
    const k = key(seat.section_name, seat.row_label, seat.seat_number)
    if (layoutKeys.has(k)) continue
    const ref = {
      section: seat.section_name ?? '',
      row: seat.row_label,
      number: seat.seat_number,
    }
    if (PROTECTED_STATUSES.has(seat.status)) {
      diff.protectedMissing.push({ ...ref, status: seat.status })
    } else {
      diff.removed.push(ref)
    }
  }

  return diff
}
