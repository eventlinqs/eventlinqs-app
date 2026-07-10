/**
 * Seat layout generation - the pure core of the reserved-seating builder.
 *
 * The organiser composes BLOCKS (row blocks, round or square tables, standing
 * areas). This module turns those blocks into the exact layout JSONB shape
 * `materialize_seats` consumes ({ sections: [{ name, color, tier_name,
 * rows: [{ label, seats: [{ number, type, blocked, x, y }] }] }], areas }),
 * with every seat given absolute canvas coordinates.
 *
 * Pure functions, no I/O: the builder previews with the same maths the server
 * saves, and the unit tests pin the geometry and numbering rules. There is no
 * capacity ceiling anywhere in this module; capacity is whatever the
 * organiser draws.
 */

export type NumberingScheme = 'numeric' | 'alpha'
export type SeatTypeName =
  | 'standard'
  | 'premium'
  | 'accessible'
  | 'companion'
  | 'restricted_view'
  | 'obstructed'

interface BlockBase {
  /** Stable client id for builder editing. */
  id: string
  /** Section this block belongs to (sections may span multiple blocks). */
  section: string
  /** Optional ticket tier bound by NAME at event attach time. */
  tierName?: string
  /** Section colour (first block of a section wins). */
  color?: string
  /** Block origin on the canvas. */
  x: number
  y: number
  /** Rotation around the block origin, degrees clockwise. */
  rotation?: number
}

export interface RowsBlock extends BlockBase {
  kind: 'rows'
  rows: number
  /** Uniform seats per row, or an explicit per-row list (irregular rooms). */
  seatsPerRow: number | number[]
  /** Row labelling: alphabetical (A, B, ... Z, AA, AB) or numeric. */
  rowLabelScheme?: NumberingScheme
  /** Starting row label: a letter for alpha ('A'), a number for numeric (1). */
  rowLabelStart?: string | number
  /** First seat number in each row (default 1). */
  seatStart?: number
  /** Reverse seat numbering direction. */
  reverseSeats?: boolean
  /**
   * Horizontal alignment for uneven rows: 'left' anchors every row to the
   * block origin (historic default); 'centre' centres each shorter row over
   * the block's widest row (the theatre look).
   */
  align?: 'left' | 'centre'
  /** Bow depth in px for curved rows (0 or absent = straight). */
  curveDepth?: number
  rowSpacing?: number
  seatSpacing?: number
  /** Seat refs ("A-1") marked accessible / companion / blocked, or removed. */
  accessibleSeats?: string[]
  companionSeats?: string[]
  blockedSeats?: string[]
  removedSeats?: string[]
  /** Per-seat label overrides: ref -> display number. */
  labelOverrides?: Record<string, string>
}

export interface TableBlock extends BlockBase {
  kind: 'table'
  shape: 'round' | 'square'
  /** Table label; doubles as the row_label so seats read "Table 1, Seat 3". */
  label: string
  seats: number
  seatLabelScheme?: NumberingScheme
  seatStart?: number
  radius?: number
  accessibleSeats?: string[]
  companionSeats?: string[]
  blockedSeats?: string[]
  /** Per-seat label overrides: ref -> display number. */
  labelOverrides?: Record<string, string>
}

/**
 * Standing / general-admission zone, or a scenery annotation. Produces NO
 * reserved seats: a 'zone' renders on the map and sells through its bound GA
 * ticket tier's normal capacity; 'scenery' is a pure room annotation (bar,
 * mixing desk, exit, cloakroom) that sells nothing and orients everyone.
 */
export interface AreaBlock extends BlockBase {
  kind: 'area'
  label: string
  width: number
  height: number
  capacity?: number
  /** 'zone' (default, sells via its GA tier) or 'scenery' (annotation only). */
  style?: 'zone' | 'scenery'
}

export type SeatBlock = RowsBlock | TableBlock | AreaBlock

export interface GeneratedSeat {
  number: string
  type: SeatTypeName
  blocked?: boolean
  x: number
  y: number
  /** Builder round-trip: the block-scoped seat reference ("A-3", "Table 1-2"). */
  ref?: string
  /** Builder round-trip: the block that generated this seat. */
  blockId?: string
}

export interface GeneratedRow {
  label: string
  seats: GeneratedSeat[]
}

export interface GeneratedSection {
  name: string
  color: string
  tier_name?: string
  sort_order: number
  rows: GeneratedRow[]
}

export interface GeneratedArea {
  label: string
  section: string
  tier_name?: string
  color: string
  x: number
  y: number
  width: number
  height: number
  capacity?: number
  /** 'zone' (default) or 'scenery' (annotation only, sells nothing). */
  style?: 'zone' | 'scenery'
}

export interface GeneratedLayout {
  version: 2
  /** The editable source of truth: re-open the builder from these. */
  blocks: SeatBlock[]
  /** The materialisable shape consumed by materialize_seats. */
  sections: GeneratedSection[]
  /** Display-only GA zones. */
  areas: GeneratedArea[]
  totalSeats: number
}

const DEFAULT_ROW_SPACING = 26
const DEFAULT_SEAT_SPACING = 24
const DEFAULT_SECTION_COLOR = '#D4A017' // gold-500 token value

/** Excel-style alphabetical label: 0 -> A, 25 -> Z, 26 -> AA. */
export function alphaLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Inverse start offset for an alpha start label like 'C' or 'AA'. */
function alphaOffset(start: string): number {
  let n = 0
  for (const ch of start.toUpperCase()) {
    const c = ch.charCodeAt(0) - 64
    if (c < 1 || c > 26) return 0
    n = n * 26 + c
  }
  return n - 1
}

function rotate(px: number, py: number, ox: number, oy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x: px, y: py }
  const rad = (deg * Math.PI) / 180
  const dx = px - ox
  const dy = py - oy
  return {
    x: ox + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: oy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

function seatType(ref: string, block: { accessibleSeats?: string[]; companionSeats?: string[] }): SeatTypeName {
  if (block.accessibleSeats?.includes(ref)) return 'accessible'
  if (block.companionSeats?.includes(ref)) return 'companion'
  return 'standard'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function generateRowsBlock(block: RowsBlock): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  const rowSpacing = block.rowSpacing ?? DEFAULT_ROW_SPACING
  const seatSpacing = block.seatSpacing ?? DEFAULT_SEAT_SPACING
  const scheme = block.rowLabelScheme ?? 'alpha'
  const startOffset =
    scheme === 'alpha'
      ? alphaOffset(String(block.rowLabelStart ?? 'A'))
      : Number(block.rowLabelStart ?? 1)

  // Centre alignment: shorter rows centre over the block's widest row.
  const maxCount = Array.isArray(block.seatsPerRow)
    ? Math.max(0, ...block.seatsPerRow)
    : block.seatsPerRow

  for (let r = 0; r < block.rows; r++) {
    const label =
      scheme === 'alpha' ? alphaLabel(startOffset + r) : String(startOffset + r)
    const count = Array.isArray(block.seatsPerRow)
      ? (block.seatsPerRow[r] ?? 0)
      : block.seatsPerRow
    if (count <= 0) continue

    const centreShift =
      block.align === 'centre' ? ((maxCount - count) / 2) * seatSpacing : 0

    const seats: GeneratedSeat[] = []
    for (let i = 0; i < count; i++) {
      const seatIdx = block.reverseSeats ? count - 1 - i : i
      const seatNo = (block.seatStart ?? 1) + seatIdx
      const ref = `${label}-${seatNo}`
      if (block.removedSeats?.includes(ref)) continue

      // Curve: a symmetric bow, deepest mid-row (t = 0.5).
      const t = count === 1 ? 0.5 : i / (count - 1)
      const bow = (block.curveDepth ?? 0) * Math.sin(Math.PI * t)
      const rawX = block.x + centreShift + i * seatSpacing
      const rawY = block.y + r * rowSpacing - bow
      const { x, y } = rotate(rawX, rawY, block.x, block.y, block.rotation ?? 0)

      seats.push({
        number: block.labelOverrides?.[ref] ?? String(seatNo),
        type: seatType(ref, block),
        ...(block.blockedSeats?.includes(ref) ? { blocked: true } : {}),
        x: round2(x),
        y: round2(y),
        ref,
        blockId: block.id,
      })
    }
    if (seats.length > 0) rows.push({ label, seats })
  }
  return rows
}

function generateTableBlock(block: TableBlock): GeneratedRow {
  const n = Math.max(1, block.seats)
  const radius = block.radius ?? Math.max(34, 10 + n * 4)
  const seats: GeneratedSeat[] = []

  for (let i = 0; i < n; i++) {
    const seatNo = (block.seatStart ?? 1) + i
    const numberLabel =
      (block.seatLabelScheme ?? 'numeric') === 'alpha' ? alphaLabel(seatNo - 1) : String(seatNo)
    const ref = `${block.label}-${numberLabel}`

    let rawX: number
    let rawY: number
    if (block.shape === 'round') {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
      rawX = block.x + radius * Math.cos(angle)
      rawY = block.y + radius * Math.sin(angle)
    } else {
      // Square table: distribute clockwise around the perimeter.
      const perSide = Math.ceil(n / 4)
      const side = Math.floor(i / perSide)
      const idxOnSide = i % perSide
      const step = (radius * 2) / (perSide + 1)
      const offset = -radius + step * (idxOnSide + 1)
      if (side === 0) { rawX = block.x + offset; rawY = block.y - radius }
      else if (side === 1) { rawX = block.x + radius; rawY = block.y + offset }
      else if (side === 2) { rawX = block.x - offset; rawY = block.y + radius }
      else { rawX = block.x - radius; rawY = block.y - offset }
    }
    const { x, y } = rotate(rawX, rawY, block.x, block.y, block.rotation ?? 0)

    seats.push({
      number: block.labelOverrides?.[ref] ?? numberLabel,
      type: seatType(ref, block),
      ...(block.blockedSeats?.includes(ref) ? { blocked: true } : {}),
      x: round2(x),
      y: round2(y),
      ref,
      blockId: block.id,
    })
  }
  return { label: block.label, seats }
}

export interface LayoutIssue {
  blockId: string
  message: string
}

/** Duplicate seat identities within a section are build-time errors. */
export function validateLayout(layout: GeneratedLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const section of layout.sections) {
    const seen = new Set<string>()
    for (const row of section.rows) {
      for (const seat of row.seats) {
        const key = `${row.label}|${seat.number}`
        if (seen.has(key)) {
          issues.push({
            blockId: section.name,
            message: `Duplicate seat in section "${section.name}": row ${row.label} seat ${seat.number}`,
          })
        }
        seen.add(key)
      }
    }
  }
  return issues
}

export function generateLayout(blocks: SeatBlock[]): GeneratedLayout {
  const sectionMap = new Map<string, GeneratedSection>()
  const areas: GeneratedArea[] = []
  let sortOrder = 0
  let totalSeats = 0

  for (const block of blocks) {
    if (block.kind === 'area') {
      areas.push({
        label: block.label,
        section: block.section,
        ...(block.tierName ? { tier_name: block.tierName } : {}),
        color: block.color ?? DEFAULT_SECTION_COLOR,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        ...(block.capacity != null ? { capacity: block.capacity } : {}),
        ...(block.style === 'scenery' ? { style: 'scenery' as const } : {}),
      })
      continue
    }

    let section = sectionMap.get(block.section)
    if (!section) {
      section = {
        name: block.section,
        color: block.color ?? DEFAULT_SECTION_COLOR,
        ...(block.tierName ? { tier_name: block.tierName } : {}),
        sort_order: sortOrder++,
        rows: [],
      }
      sectionMap.set(block.section, section)
    } else if (block.tierName && !section.tier_name) {
      section.tier_name = block.tierName
    }

    const rows = block.kind === 'rows' ? generateRowsBlock(block) : [generateTableBlock(block)]
    for (const row of rows) {
      totalSeats += row.seats.length
      const existing = section.rows.find(r => r.label === row.label)
      if (existing) existing.seats.push(...row.seats)
      else section.rows.push(row)
    }
  }

  return {
    version: 2,
    blocks,
    sections: [...sectionMap.values()],
    areas,
    totalSeats,
  }
}
